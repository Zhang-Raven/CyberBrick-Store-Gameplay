import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import {spawn,spawnSync} from 'node:child_process';
import {config} from 'dotenv';
config();
const root=path.resolve('.'),port=Number(process.env.PORT||4173);
const statusFile=path.join(root,'data/public-access.json');
if(!process.env.BAMBU_SERIAL||!process.env.BAMBU_TOKEN)throw new Error('首次公开部署前，请在本机 .env 填写打印机 SN 和访问码');
if(spawnSync('cloudflared',['--version'],{stdio:'ignore'}).status!==0)throw new Error('请先安装官方 cloudflared（macOS：brew install cloudflared）');
await new Promise((resolve,reject)=>{const probe=net.createServer();probe.once('error',()=>reject(new Error(`端口 ${port} 已有服务运行，请先停止旧服务再启动守护进程`)));probe.listen(port,'127.0.0.1',()=>probe.close(resolve));});
try{await fs.access('web/dist/index.html');}catch{if(spawnSync('npm',['run','build'],{stdio:'inherit'}).status!==0)process.exit(1);}
await fs.mkdir('data',{recursive:true});
await fs.writeFile('data/service.pid',String(process.pid),{mode:0o600});
let stopping=false,server,tunnel,serverTimer,tunnelTimer,generation=0,publicStatus={};
const log=message=>console.log(`[${new Date().toISOString()}] ${message}`);
let statusWrites=Promise.resolve();
function writeStatus(patch){
 publicStatus={...publicStatus,...patch,updatedAt:new Date().toISOString()};
 const value=JSON.stringify(publicStatus,null,2);
 statusWrites=statusWrites.then(async()=>{const tmp=`${statusFile}.tmp`;await fs.writeFile(tmp,value,{mode:0o600});await fs.rename(tmp,statusFile);});
 return statusWrites;
}
async function storeUrl(url){
 let env=await fs.readFile('.env','utf8').catch(error=>{if(error.code==='ENOENT')return '';throw error;});
 env=env.replace(/^PUBLIC_ORIGIN=.*\n?/gm,'')+`\nPUBLIC_ORIGIN=${url}\n`;
 const tmp=path.join(root,'.env.tunnel.tmp');await fs.writeFile(tmp,env,{mode:0o600});await fs.rename(tmp,path.join(root,'.env'));
 process.env.PUBLIC_ORIGIN=url;
 await writeStatus({url,connected:false});
 log(`公网入口：${url}`);
}
function startServer(){
 if(stopping)return;
 server=spawn(process.execPath,['src/local-server.js'],{cwd:root,env:{...process.env,NODE_ENV:'production',PUBLIC_ACCESS_FILE:statusFile},stdio:['ignore','inherit','inherit']});
 server.on('error',error=>log(`本地服务启动失败：${error.message}`));
 server.once('exit',(code,signal)=>{server=undefined;if(!stopping){log(`本地服务退出 (${code??signal})，5 秒后重启`);serverTimer=setTimeout(startServer,5000);}});
}
function startTunnel(){
 if(stopping)return;
 const current=++generation;
 const child=spawn('cloudflared',['tunnel','--url',`http://127.0.0.1:${port}`,'--protocol','http2','--edge-ip-version','4','--no-autoupdate'],{stdio:['ignore','pipe','pipe']});
 tunnel=child;let output='',url,invalid=false,disconnectedSince=Date.now(),pending=Promise.resolve();
 function observe(chunk){
  process.stderr.write(chunk);output=(output+chunk).slice(-32768);
  if(!url){
   const found=/https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(output)?.[0];
   if(found){url=found;pending=pending.then(()=>storeUrl(url)).catch(error=>{log(`保存域名失败：${error.message}`);child.kill('SIGTERM');});}
  }
  const line=String(chunk);
  if(/Registered tunnel connection/.test(line)){
   disconnectedSince=null;pending=pending.then(()=>writeStatus({connected:true})).catch(error=>log(error.message));
  }
  if(/Unauthorized: Tunnel not found/.test(line)&&!invalid){invalid=true;log('临时隧道已失效，重新申请免费地址');child.kill('SIGTERM');}
  if(/Connection terminated|Unable to establish connection/.test(line)){
   disconnectedSince ??= Date.now();
   pending=pending.then(()=>writeStatus({connected:false})).catch(error=>log(error.message));
  }
 }
 child.stdout.on('data',observe);child.stderr.on('data',observe);
 child.on('error',error=>log(`隧道启动失败：${error.message}`));
 const watchdog=setInterval(()=>{if(disconnectedSince!==null&&Date.now()-disconnectedSince>180000){log('隧道长时间未恢复，重新建立连接');child.kill('SIGTERM');}},30000);
 child.once('exit',async(code,signal)=>{
  clearInterval(watchdog);if(tunnel===child)tunnel=undefined;
  await pending;await writeStatus({connected:false}).catch(error=>log(error.message));
  if(!stopping&&generation===current){log(`隧道退出 (${code??signal})，10 秒后重建；本地打印服务继续运行`);tunnelTimer=setTimeout(startTunnel,10000);}
 });
}
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{
 if(stopping)return;stopping=true;fs.unlink('data/service.pid').catch(()=>{});clearTimeout(serverTimer);clearTimeout(tunnelTimer);tunnel?.kill('SIGTERM');server?.kill('SIGTERM');
});
startServer();startTunnel();
