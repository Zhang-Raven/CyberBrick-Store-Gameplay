import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = path.dirname(fileURLToPath(import.meta.url));
export function printerConfig() {
  const mode = process.env.PRINTER_MODE || 'real';
  return {
    mode, host: process.env.PRINTER_HOST || '172.20.10.7',
    serial: process.env.BAMBU_SERIAL || '', token: process.env.BAMBU_TOKEN || '',
    model: process.env.BAMBU_MODEL || 'x2d',
    mcpPath: process.env.BAMBU_MCP_PATH || path.resolve(root, '../node_modules/bambu-printer-mcp/dist/index.js'),
  };
}
export function parseToolResult(result) {
  if (result.isError) throw new Error(result.content?.filter(x => x.type === 'text').map(x => x.text).join('\n') || 'MCP 工具调用失败');
  if (result.structuredContent) return result.structuredContent;
  const value = result.content?.find(x => x.type === 'text')?.text;
  if (!value) throw new Error('MCP 工具未返回结果');
  try { return JSON.parse(value); } catch { return { text: value }; }
}
let client, starting;
let confirmationHandler = async () => ({ action: 'cancel' });
export function setConfirmationHandler(handler) { confirmationHandler = handler; }
export async function ensurePrinterMcp() {
  if (client) return client;
  if (starting) return starting;
  starting = (async () => {
    const cfg = printerConfig();
    if (!cfg.serial || !cfg.token) throw new Error('请在 .env 配置 BAMBU_SERIAL 和 BAMBU_TOKEN');
    const transport = new StdioClientTransport({ command: process.execPath, args: [cfg.mcpPath], cwd: path.resolve(root, '..'), env: { ...process.env, BAMBU_MODEL: cfg.model.toLowerCase(), MCP_TRANSPORT: 'stdio' }, stderr: 'pipe' });
    transport.stderr?.on('data', () => {}); // Credentials and protocol logs stay out of the browser.
    const candidate = new Client({ name: 'blessing-agent-real-printer', version: '2.0.0' }, { capabilities: { elicitation: { form: {} } } });
    candidate.setRequestHandler(ElicitRequestSchema, request => confirmationHandler(request.params));
    candidate.onclose = () => { if (client === candidate) client = undefined; };
    try {
      await candidate.connect(transport);
      client = candidate;
      return candidate;
    } catch (error) { await candidate.close().catch(() => {}); throw error; }
  })().finally(() => { starting = undefined; });
  return starting;
}
export async function callPrinterTool(name, args = {}, timeout = 30000) {
  const c = await ensurePrinterMcp();
  const cfg = printerConfig();
  return parseToolResult(await c.callTool({ name, arguments: { host: cfg.host, bambu_serial: cfg.serial, bambu_token: cfg.token, bambu_model: cfg.model.toLowerCase(), ...args } }, undefined, { timeout }));
}
export async function closePrinterMcp() { await starting?.catch(() => {}); await client?.close().catch(() => {}); client = undefined; }
