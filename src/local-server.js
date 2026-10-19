import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { runAgent, validateBirthMonth } from './agent.js';
import { callPrinterTool, closePrinterMcp, printerConfig, setConfirmationHandler } from './printer-mcp.js';
import { readManifest, registerCharm, resolveCharm, dataDir } from './charm-assets.js';
import { readCharmPlates } from './source-catalog.js';
import { renderToolpathPreview } from './toolpath-preview.js';
import { createAccess } from './access.js';
import { loadPrinterSettings, publicPrinterSettings, savePrinterSettings, validatePrinterSettings } from './device-settings.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv({ path: path.join(root, '.env') });
process.chdir(root);
await loadPrinterSettings();
const port = Number(process.env.PORT || 4173);
const publicOrigin = process.env.PUBLIC_ORIGIN ? new URL(process.env.PUBLIC_ORIGIN).origin : '';
const access = () => { const c=printerConfig(); return createAccess(c.serial && c.token ? `${c.serial}:${c.token}` : ''); };
if (publicOrigin && !access().required) throw new Error('首次公开部署前，请在本地 .env 填写打印机 SN 和访问码');
const allowedOrigins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`, ...(publicOrigin ? [publicOrigin] : [])];
const allowedHosts = allowedOrigins.map(origin => new URL(origin).host);
const mode = process.env.PRINTER_MODE || 'real';
const state = { mode, printer: { connected: false, model: printerConfig().model, host: printerConfig().host }, job: null, confirmation: null };
const journal = process.env.JOB_JOURNAL_PATH || path.join(dataDir, 'job.json');
try {
  state.job = JSON.parse(await fs.readFile(journal, 'utf8'));
  if (state.job && ['running', 'attention'].includes(state.job.status)) state.job = { ...state.job, status: 'attention', message: '服务重启前任务未确认结束。请检查打印机，并结束旧任务监控后再提交。' };
} catch (error) { if (error.code !== 'ENOENT') throw error; }
let writes = Promise.resolve();
function recordJob(event) {
  state.job = { ...state.job, ...event, updatedAt: new Date().toISOString() };
  const value = JSON.stringify(state.job, null, 2);
  writes = writes.then(async () => { await fs.mkdir(dataDir, { recursive: true }); await fs.writeFile(`${journal}.tmp`, value); await fs.rename(`${journal}.tmp`, journal); });
  return writes;
}
let polling;
let configuring = false;
const previewCache = new Map();
async function refreshPrinter() {
  if (configuring) return;
  if (mode !== 'real') return;
  if (polling) return polling;
  polling = (async () => {
    try {
      const s = await callPrinterTool('get_printer_status');
      state.printer = { connected: Boolean(s.connected), host: printerConfig().host, model: s.model || printerConfig().model, serial: printerConfig().serial, status: s.status, nozzleTemp: s.temperatures?.nozzle?.actual, bedTemp: s.temperatures?.bed?.actual, hardwareProgress: s.print?.progress, layerNum: s.print?.currentLayer, totalLayers: s.print?.totalLayers, remainingMinutes: s.print?.timeRemaining, filename: s.print?.filename, nozzleDiameter: s.raw?.nozzle_diameter, ams: s.ams, connectionError: s.error };
    } catch (error) { state.printer = { ...state.printer, connected: false, status: 'offline', connectionError: safeError(error) }; }
  })().finally(() => { polling = undefined; });
  return polling;
}
function safeError(error) { return String(error?.message || error).replaceAll(printerConfig().token || '\0', '[访问码]'); }
let confirmationResolver;
setConfirmationHandler(async params => {
  if (state.confirmation) return { action: 'cancel' };
  const id = randomUUID();
  state.confirmation = { id, message: params.message };
  await recordJob({ stage: 'confirmation', status: 'running', message: '灯符文件已检查，请核对材料并确认打印板已清空' });
  return new Promise(resolve => {
    const timer = setTimeout(() => finish(false), 290000);
    const finish = confirmed => {
      clearTimeout(timer); state.confirmation = null; confirmationResolver = undefined;
      if (!confirmed && state.job) state.job.confirmationDeclined = true;
      resolve(confirmed ? { action: 'accept', content: { confirmed: true } } : { action: 'decline' });
    };
    confirmationResolver = finish;
  });
});
async function readBody(req, limit = 1024 * 1024) {
  const chunks = []; let total = 0;
  for await (const chunk of req) { total += chunk.length; if (total > limit) throw new Error('请求文件过大'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
const json = (res, code, value) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)); };
async function runtimeStatus() {
  const cfg = printerConfig();
  const checks = {
    slicer: process.env.SLICER_PATH,
    nativeHelper: process.env.BAMBU_NATIVE_HELPER || path.join(root, 'node_modules/bambu-printer-mcp/native/bambu-native-print'),
    networkPlugin: process.env.BAMBU_NATIVE_PLUGIN || path.join(process.env.HOME || '', 'Library/Application Support/BambuStudio/plugins/libbambu_networking.dylib'),
  };
  const missing = [];
  for (const [name, file] of Object.entries(checks)) { try { if (!file) throw new Error(); await fs.access(file); } catch { missing.push(name); } }
  return { missing, ready: !missing.length, model: cfg.model };
}
const vite = process.env.NODE_ENV === 'production' ? null : await createViteServer({ root: path.join(root, 'web'), server: { middlewareMode: true, hmr: false, allowedHosts }, appType: 'spa' });
const loginAttempts = new Map();
let mutationInProgress = false;
const server = http.createServer(async (req, res) => {
  const mutation = req.method !== 'GET';
  if (mutation && mutationInProgress) return json(res, 409, {error:'另一个请求正在处理，请稍后再试'});
  if (mutation) mutationInProgress = true;
  try {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('x-frame-options', 'DENY');
    if (!allowedHosts.includes(req.headers.host)) return json(res, 403, { error: '访问域名未配置' });
    if (mutation && req.headers.origin && !allowedOrigins.includes(req.headers.origin)) return json(res, 403, { error: '请求来源不匹配' });
    const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    if (url.pathname === '/api/session' && req.method === 'GET') return json(res, 200, { authenticated: access().authenticated(req), required: access().required });
    const authenticated = access().authenticated(req);
    if (url.pathname === '/api/printer/config' && req.method === 'GET') {
      return json(res,200,{config:authenticated?publicPrinterSettings():{host:'',serial:'',model:'x2d',accessCodeConfigured:false}});
    }
    if (url.pathname === '/api/printer/config' && req.method === 'POST' && !authenticated) {
      const key=String(req.headers['cf-connecting-ip']||req.socket.remoteAddress),now=Date.now();
      for(const [ip,item] of loginAttempts)if(item.reset<=now)loginAttempts.delete(ip);
      const attempt=loginAttempts.get(key)||{count:0,reset:now+15*60*1000};
      if(attempt.count>=8||loginAttempts.size>1000)return json(res,429,{error:'访问码尝试次数过多，请 15 分钟后重试'});
      const input=JSON.parse((await readBody(req,4096)).toString());
      if(typeof input.token!=='string'||!access().verifyPassword(`${String(input.serial||'').trim()}:${input.token.trim()}`)){
        attempt.count++;loginAttempts.set(key,attempt);
        return json(res,401,{error:'完整 SN 或 8 位打印机访问码不匹配，请从设备屏幕重新核对'});
      }
      loginAttempts.delete(key);
      req.printerSettingsInput=input;
    } else if(url.pathname.startsWith('/api/') && !authenticated) return json(res,401,{error:'请先填写打印机参数并连接'});
    if (url.pathname === '/api/logout' && req.method === 'POST') {
      res.setHeader('set-cookie', 'blessing_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
      return json(res, 200, {authenticated:false});
    }
    if (url.pathname === '/api/printer/config' && req.method === 'POST') {
      if (state.job?.status === 'running') return json(res, 409, {error:'任务进行中，暂不能更换打印机参数'});
      const input = req.printerSettingsInput || JSON.parse((await readBody(req,4096)).toString());
      const next = validatePrinterSettings(input);
      if (state.job?.status === 'attention' && next.serial !== printerConfig().serial) return json(res, 409, {error:'先核对旧打印任务并结束监控，才可更换设备 SN'});
      configuring = true;
      try {
        if (polling) await polling;
        await closePrinterMcp();
        const config = await savePrinterSettings(next);
        state.printer = {connected:false,host:config.host,model:config.model,status:'待测试'};
        const secure=publicOrigin.startsWith('https:')?'; Secure':'';
        res.setHeader('set-cookie',`blessing_session=${access().issue()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure}`);
        return json(res,200,{config,message:'参数已保存，正在连接打印机'});
      } finally { configuring = false; }
    }
    if (url.pathname === '/api/printer/test' && req.method === 'POST') {
      await refreshPrinter();
      return json(res,200,{connected:state.printer.connected,printer:state.printer,message:state.printer.connected?'已连接真实打印机':'连接失败：请确认本地服务电脑与打印机在同一局域网，并核对 IP、完整 SN、访问码和开发者模式'});
    }
    if (url.pathname === '/api/status') {
      await refreshPrinter();
      let charms = [], catalogError;
      try { charms = await readCharmPlates(); } catch (error) { catalogError = safeError(error); }
      return json(res, 200, { ...state, charms, catalogError, assets: await readManifest(), runtime: await runtimeStatus() });
    }
    if (url.pathname === '/api/charm/thumbnail') {
      const charm = (await readCharmPlates()).find(c => c.name === url.searchParams.get('name'));
      if (!charm) return json(res, 404, { error: '未找到命名灯符' });
      const item = await resolveCharm(charm.name);
      let preview = previewCache.get(item.file);
      if (!preview) {
        preview = await renderToolpathPreview(item.filePath, item.plateIndex, charm.name);
        previewCache.set(item.file, preview);
      }
      res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'no-cache' }); return res.end(preview);
    }
    if (url.pathname === '/api/confirmation' && req.method === 'POST') {
      const input = JSON.parse((await readBody(req)).toString());
      if (!state.confirmation || input.id !== state.confirmation.id || !confirmationResolver) return json(res, 409, { error: '确认已失效' });
      confirmationResolver(input.confirmed === true);
      return json(res, 200, { accepted: input.confirmed === true });
    }
    if (url.pathname === '/api/job/resolve' && req.method === 'POST') {
      await refreshPrinter();
      if (state.job?.status !== 'attention' || !state.printer.connected || !['IDLE', 'FINISH', 'FAILED'].includes(state.printer.status)) return json(res, 409, { error: '需要设备在线且旧任务已停止，才可结束监控' });
      await recordJob({ status: 'resolved', message: '用户已核对打印机并结束旧任务监控' });
      return json(res, 200, { job: state.job });
    }
    if (url.pathname === '/api/charms' && req.method === 'POST') {
      if (state.job && ['running', 'attention'].includes(state.job.status)) return json(res, 409, { error: '当前任务未结束，不能修改灯符文件' });
      const input = JSON.parse(decodeURIComponent(String(req.headers['x-charm-config'] || '{}')));
      const buffer = await readBody(req, 150 * 1024 * 1024);
      const item = await registerCharm({ ...input, buffer });
      return json(res, 200, { item });
    }
    if (url.pathname === '/api/run' && req.method === 'POST') {
      if (state.job && ['running', 'attention'].includes(state.job.status)) return json(res, 409, { error: '当前任务尚未结束，请勿重复提交' });
      if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: '请使用 JSON 请求' });
      const input = JSON.parse((await readBody(req)).toString());
      const birthYear = Number(input.birthYear), birthMonth = Number(input.birthMonth);
      validateBirthMonth(birthYear, birthMonth);
      // Validate files and runtime before any model call or print submission.
      await readCharmPlates();
      if (mode === 'real') {
        await refreshPrinter();
        if (!state.printer.connected || !['IDLE', 'FINISH'].includes(state.printer.status)) return json(res, 409, { error: '打印机离线或正在执行其他任务' });
        const runtime = await runtimeStatus();
        if (!runtime.ready) return json(res, 409, { error: `打印环境未准备：${runtime.missing.join('、')}` });
      }
      state.job = null;
      await recordJob({ stage: 'fortune', status: 'running', message: '正在分析今日运势' });
      json(res, 202, { job: state.job });
      runAgent({ birthYear, birthMonth, mode, onProgress: event => recordJob(event) })
        .catch(async error => {
          if (state.job?.confirmationDeclined) {
            await recordJob({ stage: 'cancelled', status: 'cancelled', message: '已取消本次打印，设备未收到打印命令', error: null });
            return;
          }
          const mayHaveSubmitted = !state.job?.confirmationDeclined && ['submitting', 'confirmation', 'printing'].includes(state.job?.stage);
          await recordJob({ stage: 'failed', status: mayHaveSubmitted ? 'attention' : 'failed', message: mayHaveSubmitted ? '任务结果需要核对，请检查真实打印机' : '任务未完成', error: safeError(error) });
        });
      return;
    }
    if (url.pathname.startsWith('/api/')) return json(res,404,{error:'接口不存在'});
    if (vite) return vite.middlewares(req, res);
    if (req.method !== 'GET') return json(res,405,{error:'不支持此方法'});
    const dist = path.join(root,'web/dist');
    const requested = path.resolve(dist, `.${decodeURIComponent(url.pathname)}`);
    if (requested !== dist && !requested.startsWith(dist+path.sep)) return json(res,404,{error:'未找到文件'});
    const file = url.pathname.startsWith('/assets/') ? requested : path.join(dist,'index.html');
    const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
    const content = await fs.readFile(file);
    res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':url.pathname.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-store'});
    res.end(content);
  } catch (error) { if (!res.headersSent) json(res, 400, { error: safeError(error) }); else res.end(); }
  finally { if (mutation) mutationInProgress = false; }
});
server.listen(port, '127.0.0.1', () => console.log(`祈福打印站 (${mode}): http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  confirmationResolver?.(false); server.close(); await writes; await vite?.close(); await closePrinterMcp(); process.exit(0);
});
