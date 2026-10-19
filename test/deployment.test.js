import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createAccess} from '../src/access.js';
import {validatePrinterSettings} from '../src/device-settings.js';

test('public control sessions require printer credentials and reject tampered cookies',()=>{
 const access=createAccess('20P1234567890:ABCDEFGH');
 assert.equal(access.authenticated({headers:{}}),false);
 assert.equal(access.verifyPassword('wrong'),false);
 assert.equal(access.verifyPassword('20P1234567890:ABCDEFGH'),true);
 const token=access.issue();
 assert.equal(access.authenticated({headers:{cookie:`blessing_session=${token}`}}),true);
 assert.equal(access.authenticated({headers:{cookie:`blessing_session=${token.replace(/^\d+/, '9999999999999')}`}}),false);
 assert.equal(createAccess('').authenticated({headers:{}}),true);
});

test('printer configuration accepts only private LAN IPs and full device credentials',()=>{
 const current={serial:'20P1234567890',token:'ABCDEFGH'};
 const input={host:'172.20.10.7',serial:current.serial,token:'',model:'x2d'};
 assert.equal(validatePrinterSettings(input,current).token,'ABCDEFGH');
 for(const host of ['8.8.8.8','127.0.0.1','169.254.169.254','localhost','172.32.0.1','192.168.1.999'])assert.throws(()=>validatePrinterSettings({...input,host},current),/局域网/);
 assert.throws(()=>validatePrinterSettings({...input,serial:'ef2bd3c'},current),/完整 SN/);
 assert.throws(()=>validatePrinterSettings({...input,serial:'20P9876543210'},current),/8 位/);
 assert.throws(()=>validatePrinterSettings({...input,model:'a1'},current),/X2D/);
});

test('production HTTP service protects controls, persists credentials privately, and blocks foreign origins',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'blessing-deployment-'));
 const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(r=>listener.close(r));
 const child=spawn(process.execPath,['src/local-server.js'],{cwd:path.resolve('.'),env:{...process.env,NODE_ENV:'production',PORT:String(port),PUBLIC_ORIGIN:'https://test-fixture.trycloudflare.com',PUBLIC_ACCESS_FILE:path.join(dir,'public-access.json'),PRINTER_MODE:'real',BAMBU_MCP_PATH:path.join(dir,'missing-mcp.js'),PRINTER_HOST:'192.168.1.123',BAMBU_SERIAL:'20P1234567890',BAMBU_TOKEN:'ABCDEFGH',PRINTER_SETTINGS_PATH:path.join(dir,'printer.json'),JOB_JOURNAL_PATH:path.join(dir,'job.json')},stdio:'pipe'});
 let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
 t.after(async()=>{child.kill('SIGTERM');await once(child,'exit').catch(()=>{});await fs.rm(dir,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${port}`;
 for(let i=0;i<100;i++){try{await fetch(`${base}/api/session`);break;}catch{await new Promise(r=>setTimeout(r,50));}}
 assert.equal(child.exitCode,null,logs);
 await fs.writeFile(path.join(dir,'public-access.json'),JSON.stringify({url:'https://test-recovered.trycloudflare.com'}));
 const dynamicHost=await new Promise((resolve,reject)=>{const request=http.get(`${base}/api/session`,{headers:{host:'test-recovered.trycloudflare.com'}},response=>{response.resume();response.on('end',()=>resolve(response.statusCode));});request.on('error',reject);});assert.equal(dynamicHost,200);
 await fs.writeFile(path.join(dir,'public-access.json'),JSON.stringify({url:'https://test-fixture.trycloudflare.com'}));

 assert.equal((await fetch(base)).status,200);
 assert.equal((await fetch(`${base}/api/status`)).status,401);
 const initial=await (await fetch(`${base}/api/printer/config`)).json();assert.equal(initial.config.serial,'');
 assert.equal((await (await fetch(`${base}/api/session`)).json()).authenticated,false);
 const foreign=await fetch(`${base}/api/printer/config`,{method:'POST',headers:{origin:'https://evil.invalid','content-type':'application/json'},body:'{}'});assert.equal(foreign.status,403);
 const login=await fetch(`${base}/api/printer/config`,{method:'POST',headers:{origin:'https://test-fixture.trycloudflare.com','content-type':'application/json'},body:JSON.stringify({host:'192.168.1.123',serial:'20P1234567890',token:'ABCDEFGH',model:'x2d'})});
 assert.equal(login.status,200);const setCookie=login.headers.get('set-cookie');assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/Secure/);assert.match(setCookie,/SameSite=Strict/);
 let cookie=setCookie.split(';')[0];
 const offlineStatus=await (await fetch(`${base}/api/status`,{headers:{cookie}})).json();assert.equal(offlineStatus.printer.status,'待测试');assert.equal(offlineStatus.printer.connectionError,undefined);
 const config=await (await fetch(`${base}/api/printer/config`,{headers:{cookie}})).json();assert.equal(config.config.accessCodeConfigured,true);assert.equal(JSON.stringify(config).includes('ABCDEFGH'),false);
 const save=await fetch(`${base}/api/printer/config`,{method:'POST',headers:{cookie,origin:'https://test-fixture.trycloudflare.com','content-type':'application/json'},body:JSON.stringify({host:'192.168.1.124',serial:'20P1234567890',token:'87654321',model:'x2d'})});assert.equal(save.status,200);const replacementCookie=save.headers.get('set-cookie').split(';')[0];assert.equal((await save.text()).includes('87654321'),false);
 assert.equal((await fetch(`${base}/api/status`,{headers:{cookie}})).status,401);cookie=replacementCookie;
 const stored=path.join(dir,'printer.json');assert.equal(JSON.parse(await fs.readFile(stored,'utf8')).token,'87654321');assert.equal((await fs.stat(stored)).mode&0o777,0o600);
 const blocked=await fetch(`${base}/api/printer/config`,{method:'POST',headers:{cookie,origin:'https://evil.invalid','content-type':'application/json'},body:'{}'});assert.equal(blocked.status,403);
 const forbiddenHost=await new Promise((resolve,reject)=>{const request=http.get(`${base}/api/printer/config`,{headers:{cookie,host:'evil.invalid'}},response=>{response.resume();response.on('end',()=>resolve(response.statusCode));});request.on('error',reject);});assert.equal(forbiddenHost,403);
 for(let i=0;i<8;i++){const r=await fetch(`${base}/api/printer/config`,{method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':'rate-limit-fixture'},body:'{"serial":"20P1234567890","token":"wrong"}'});assert.equal(r.status,401);}
 assert.equal((await fetch(`${base}/api/printer/config`,{method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':'rate-limit-fixture'},body:'{}'})).status,429);
 const logout=await fetch(`${base}/api/logout`,{method:'POST',headers:{cookie}});assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
});
