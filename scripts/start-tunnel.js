import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import {spawn,spawnSync} from 'node:child_process';
import {config} from 'dotenv';
config();
const root=path.resolve('.'),port=Number(process.env.PORT||4173);
await new Promise((resolve,reject)=>{const probe=net.createServer();probe.once('error',()=>reject(new Error(`端口 ${port} 已有服务运行，请先停止旧服务再重建隧道`)));probe.listen(port,'127.0.0.1',()=>probe.close(resolve));});
if(spawnSync('cloudflared',['--version'],{stdio:'ignore'}).status!==0)throw new Error('请先安装官方 cloudflared（macOS 可运行 brew install cloudflared）');
try{await fs.access('web/dist/index.html');}catch{if(spawnSync('npm',['run','build'],{stdio:'inherit'}).status!==0)process.exit(1);}
const tunnel=spawn('cloudflared',['tunnel','--url',`http://127.0.0.1:${port}`,'--protocol','http2','--no-autoupdate'],{stdio:['ignore','pipe','pipe']});
let server,started=false,logs='';
if(!process.env.BAMBU_SERIAL || !process.env.BAMBU_TOKEN)throw new Error('首次公开部署前，请在本机 .env 填写打印机 SN 和访问码');
async function observe(chunk){
 process.stderr.write(chunk);
 logs=(logs+chunk).slice(-32768);
 const url=/https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(logs)?.[0];
 if(!url||started)return;
 started=true;
 try{
  let env='';try{env=await fs.readFile('.env','utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
  for(const [key,value] of Object.entries({PUBLIC_ORIGIN:url})){env=env.replace(new RegExp(`^${key}=.*\\n?`,'gm'),'');env+=`\n${key}=${value}\n`;}
  await fs.writeFile('.env',env,{mode:0o600});await fs.chmod('.env',0o600);
  await fs.mkdir('data',{recursive:true});
  await fs.writeFile('data/public-access.json',JSON.stringify({url}),{mode:0o600});await fs.chmod('data/public-access.json',0o600);
  server=spawn(process.execPath,['src/local-server.js'],{cwd:root,env:{...process.env,NODE_ENV:'production',PUBLIC_ORIGIN:url},stdio:'inherit'});
  server.on('exit',code=>{tunnel.kill('SIGTERM');process.exitCode=code||0;});
  console.log(`\n公网入口：${url}\n打开页面后填写打印机 IP、完整 SN 和 8 位访问码即可连接，无独立站点口令。\n域名会随隧道重新创建而变化；本地服务电脑须与打印机处于同一局域网。\n`);
 }catch(error){console.error(error.message);tunnel.kill('SIGTERM');process.exitCode=1;}
}
tunnel.stdout.on('data',observe);tunnel.stderr.on('data',observe);
tunnel.on('error',error=>{console.error(error.message);process.exitCode=1;});
tunnel.on('exit',code=>{if(!started){console.error('Cloudflare 隧道未启动，请检查网络');process.exitCode=code||1;}});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{tunnel.kill('SIGTERM');server?.kill('SIGTERM');});
