// Start the tunnel supervisor outside the terminal's process group.
import fs from 'node:fs/promises';
import {openSync,closeSync} from 'node:fs';
import {spawn} from 'node:child_process';
import path from 'node:path';
const root=path.resolve('.');
await fs.mkdir('data',{recursive:true});
let running=false;
try{const pid=Number(await fs.readFile('data/service.pid','utf8'));if(Number.isInteger(pid)&&pid>1){process.kill(pid,0);running=true;}}catch{}
if(!running){
 const fd=openSync('data/service.log','a',0o600);
 const child=spawn(process.execPath,['scripts/start-tunnel.js'],{cwd:root,detached:true,stdio:['ignore',fd,fd]});
 child.on('error',error=>console.error(`后台服务启动失败：${error.message}`));
 child.unref();closeSync(fd);
 console.log('后台守护服务已启动。最新公网地址见 data/public-access.json，日志见 data/service.log。');
}else console.log('后台守护服务已在运行。');
