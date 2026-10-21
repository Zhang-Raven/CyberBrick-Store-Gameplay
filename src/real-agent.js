import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { chooseCharm } from './catalog.js';
import { readCharmPlates } from './source-catalog.js';
import { resolveCharm, dataDir, inspect3mf } from './charm-assets.js';
import { callPrinterTool } from './printer-mcp.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export function matchedJob(status, expectedName) {
  if (!expectedName) return false;
  const normalize = s => path.basename(String(s || '')).replace(/^checked-[0-9a-f-]{36}-/, '').replace(/(?:\.gcode)?\.3mf$/i, '');
  return [status.print?.filename, status.raw?.gcode_file, status.raw?.subtask_name].some(name => normalize(name) === normalize(expectedName));
}
export async function monitorPrint({ callTool = callPrinterTool, expectedName, onProgress, pollMs = 3000, maxPolls = 28800 }) {
  let seenActive = false;
  let lastError;
  for (let i = 0; i < maxPolls; i++) {
    await sleep(pollMs);
    let current;
    try { current = await callTool('get_printer_status'); if (!current.connected) throw new Error('打印机断线'); }
    catch (error) { lastError = error; await onProgress({ stage: 'printing', status: 'running', message: '暂时无法回读打印机，继续监控；请勿重复提交', error: error.message }); continue; }
    lastError = undefined;
    if (!matchedJob(current, expectedName)) {
      if (seenActive) throw new Error('设备当前任务已变化，无法继续确认本次任务结果');
      if (i >= 40) throw new Error('未回读到本次打印任务，设备可能尚未接受；请检查打印机后再操作');
      continue;
    }
    if (['RUNNING', 'PREPARE', 'PAUSE'].includes(current.status)) seenActive = true;
    if (['FAILED', 'ERROR'].includes(current.status) || Number(current.raw?.print_error || 0)) throw new Error(`设备报告打印错误：${current.raw?.print_error || current.status}`);
    const complete = current.status === 'FINISH';
    await onProgress({ stage: complete ? 'completed' : 'printing', status: complete ? 'completed' : 'running', message: complete ? '真实打印机已报告本次灯符打印完成' : current.status === 'PAUSE' ? '打印机已暂停，请检查设备' : `设备 ${current.status} · ${current.print?.progress ?? 0}%`, progress: current.print?.progress ?? 0, hardwareStatus: current });
    if (complete) return current;
  }
  throw new Error(lastError ? '监控超时，设备可能仍在打印；请检查打印机' : '监控已超过 24 小时，请检查打印机');
}
export async function prepareCharm(charm, callTool = callPrinterTool, { forceSlice = false } = {}) {
  try {
    if (forceSlice) throw new Error('尚未导入：要求重新切片');
    const item = await resolveCharm(charm.name);
    await fs.mkdir(path.join(dataDir, 'prepared'), {recursive:true});
    const filePath = path.join(dataDir, 'prepared', `${charm.name}-${randomUUID()}.gcode.3mf`);
    await fs.copyFile(item.filePath, filePath);
    return {...item, filePath};
  }
  catch (error) { if (!error.message.startsWith('尚未导入')) throw error; }
  if (!process.env.SLICER_PATH || !process.env.CHARM_LOAD_FILAMENTS) throw new Error('尚未配置 Bambu Studio 和两色 PLA 切片配置；也可在页面导入已切片文件');
  const output = await callTool('slice_stl', {
    stl_path: path.resolve(process.env.CHARM_PROJECT_3MF), slicer_type: 'bambustudio',
    nozzle_diameter: process.env.BAMBU_NOZZLE_DIAMETER || '0.4',
    bed_type: process.env.BAMBU_BED_TYPE || 'textured_plate',
    use_printer_filaments: false, load_filaments: process.env.CHARM_LOAD_FILAMENTS,
    filament_colours: '#0A2989;#FFFFFF', uptodate: true,
    slice_plate: charm.plateIndex + 1, arrange: false, ensure_on_bed: true,
    skip_modified_gcodes: true,
  }, 600000);
  const file = typeof output === 'string' ? output : output.outputPath || output.output_path || output.path || output.text;
  if (typeof file !== 'string' || !file.endsWith('.3mf')) throw new Error(`切片结果未返回 3MF 路径：${JSON.stringify(output).slice(0, 250)}`);
  const buffer = await fs.readFile(file);
  const { plates } = await inspect3mf(buffer);
  // The slicer may preserve the original plate number or re-number its sole exported plate.
  const chosen = plates.find(p => p.plateIndex === charm.plateIndex) || (plates.length === 1 ? plates[0] : undefined);
  if (!chosen || plates.length !== 1) throw new Error('切片输出必须只含所选灯符的一板 G-code');
  await fs.mkdir(path.join(dataDir, 'prepared'), { recursive: true });
  const filePath = path.join(dataDir, 'prepared', `${charm.name}-${randomUUID()}.gcode.3mf`);
  await fs.writeFile(filePath, buffer);
  return { name: charm.name, filePath, ...chosen, useAms: true, amsSlots: [0, 3] };
}
export async function runRealAgent({ personality, birthYear, birthMonth, fortuneProvider, date, onProgress, callTool = callPrinterTool, prepare = prepareCharm, monitor = monitorPrint }) {
  const fortune = await fortuneProvider(personality ? { personality, date } : { birthYear, birthMonth, date });
  const selection = chooseCharm(fortune);
  const base = { mode: 'real-bambu-mcp', fortune, selection };
  const emit = async event => onProgress({ ...base, ...event });
  await emit({ stage: 'selection', status: 'running', message: `今日匹配「${selection.charm}」` });
  const charms = await readCharmPlates(path.resolve(process.env.CHARM_PROJECT_3MF));
  const charm = charms.find(item => item.name === selection.charm);
  if (!charm) throw new Error('所选灯符不在七款命名清单内');
  const hardware = await callTool('get_printer_status');
  if (!hardware.connected || !['IDLE', 'FINISH'].includes(hardware.status)) throw new Error(`打印机当前不可开始新任务：${hardware.status || '离线'}`);
  await emit({ stage: 'slicing', status: 'running', message: `正在为 X2D / 0.4mm / 蓝白 PLA 准备「${charm.name}」` });
  const prepared = await prepare(charm, callTool);
  await emit({ stage: 'submitting', status: 'running', message: '文件已准备，正在检查设备与耗材' });
  const submitted = await callTool('print_3mf', {
    three_mf_path: prepared.filePath, plate_index: prepared.plateIndex,
    connection_mode: 'bambu_native', use_ams: prepared.useAms,
    ...(prepared.useAms ? { ams_slots: prepared.amsSlots } : {}),
    bed_type: process.env.BAMBU_BED_TYPE || 'textured_plate',
    bed_leveling: true, timelapse: false,
  }, 600000);
  if (submitted.status === 'error' || submitted.ok === false) throw new Error(submitted.message || '打印提交失败');
  const expectedName = path.basename(prepared.filePath);
  if (!expectedName) throw new Error('传输返回结果缺少任务标识，无法确认是否已打印；请检查设备');
  await emit({ stage: 'printing', status: 'running', message: '提交已返回，等待设备报告本次任务', jobId: expectedName, submission: submitted, progress: 0 });
  const current = await monitor({ callTool, expectedName, onProgress: emit });
  const result = { mode: 'real-bambu-mcp', date, fortune, selection, print: { charm: charm.name, plateIndex: prepared.plateIndex, estimatedSeconds: prepared.estimatedSeconds, estimatedGrams: prepared.estimatedGrams, jobId: expectedName, status: current.status, progress: current.print?.progress } };
  await emit({ stage: 'completed', status: 'completed', message: '真实灯符打印完成', result });
  return result;
}
