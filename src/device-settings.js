import fs from 'node:fs/promises';
import path from 'node:path';
import {isIP} from 'node:net';
import {randomUUID} from 'node:crypto';
import {printerConfig} from './printer-mcp.js';
const settingsPath=()=>process.env.PRINTER_SETTINGS_PATH || path.resolve('data/printer-settings.json');
function apply(settings) {
  process.env.PRINTER_HOST=settings.host;
  process.env.BAMBU_SERIAL=settings.serial;
  process.env.BAMBU_TOKEN=settings.token;
  process.env.BAMBU_MODEL=settings.model;
}
export function validatePrinterSettings(input,current=printerConfig()) {
  const host=String(input.host||'').trim();
  const octets=host.split('.').map(Number);
  const privateAddress=isIP(host)===4 && (octets[0]===10 || octets[0]===172&&octets[1]>=16&&octets[1]<=31 || octets[0]===192&&octets[1]===168);
  if(!privateAddress)throw new Error('请填写打印机的局域网 IPv4 地址，例如 192.168.1.100');
  const serial=String(input.serial||'').trim();
  if(!/^[A-Za-z0-9]{10,32}$/.test(serial))throw new Error('请填写设备信息页的完整 SN，不能使用访问码代替');
  const token=String(input.token||'').trim() || (serial===current.serial?current.token:'');
  if(!/^[A-Za-z0-9]{8}$/.test(token))throw new Error('请输入打印机的 8 位局域网访问码');
  const model=String(input.model||'x2d').toLowerCase();
  if(model!=='x2d')throw new Error('当前七款切片适用于 X2D / 0.4mm，请勿使用其他机型');
  return {host,serial,token,model};
}
export function publicPrinterSettings() {
  const c=printerConfig();
  return {host:c.host,serial:c.serial,model:c.model,accessCodeConfigured:Boolean(c.token),nozzle:'0.4 mm',materials:'蓝色 PLA Basic / 白色 PLA Lite',amsSlots:[0,3]};
}
export async function loadPrinterSettings() {
  try { apply(validatePrinterSettings(JSON.parse(await fs.readFile(settingsPath(),'utf8')))); }
  catch(error){if(error.code!=='ENOENT')throw error;}
}
export async function savePrinterSettings(input) {
  const settings=validatePrinterSettings(input);
  const file=settingsPath(),tmp=`${file}.${randomUUID()}.tmp`;
  await fs.mkdir(path.dirname(file),{recursive:true});
  await fs.writeFile(tmp,JSON.stringify(settings,null,2),{mode:0o600,flag:'wx'});
  await fs.rename(tmp,file);
  apply(settings);
  return publicPrinterSettings();
}
