import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import { parseStringPromise } from 'xml2js';
import { CHARM_NAMES } from './catalog.js';

export const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
const manifestPath = path.join(dataDir, 'charms.json');
export async function readManifest() {
  try { return JSON.parse(await fs.readFile(manifestPath, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}
export async function inspect3mf(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const plates = Object.keys(zip.files).flatMap(name => {
    const match = /^Metadata\/plate_(\d+)\.gcode$/.exec(name);
    if (!match) return [];
    if (zip.files[name]._data?.uncompressedSize > 256 * 1024 * 1024) throw new Error('单板 G-code 超过 256MB');
    return [{ plateIndex: Number(match[1]) - 1, gcodePath: name }];
  }).sort((a, b) => a.plateIndex - b.plateIndex);
  if (!plates.length) throw new Error('这是未切片的模型 3MF。请用 Bambu Studio 的 X2D / 0.4mm 配置切片后，导出切片盘文件 .gcode.3mf');
  const info = zip.file('Metadata/slice_info.config');
  if (info) {
    const xml = await parseStringPromise(await info.async('string'));
    for (const plate of xml.config.plate || []) {
      const metadata = Object.fromEntries((plate.metadata || []).map(m => [m.$.key, m.$.value]));
      const entry = plates.find(p => p.plateIndex === Number(metadata.index) - 1);
      if (entry) Object.assign(entry, { estimatedSeconds: Number(metadata.prediction), estimatedGrams: Number(metadata.weight) });
    }
  }
  return { plates };
}
export async function registerCharm({ name, buffer, plateIndex, useAms, amsSlots }) {
  if (!CHARM_NAMES.includes(name)) throw new Error('未知灯符名称');
  if (!Number.isInteger(plateIndex) || plateIndex < 0) throw new Error('打印板编号必须为正整数');
  const { plates } = await inspect3mf(buffer);
  if (!plates.some(p => p.plateIndex === plateIndex)) throw new Error(`该文件没有第 ${plateIndex + 1} 板，可用板：${plates.map(p => p.plateIndex + 1).join('、')}`);
  if (useAms && (!Array.isArray(amsSlots) || !amsSlots.length || amsSlots.some(n => !Number.isInteger(n) || n < 0 || n > 15))) throw new Error('请按文件中耗材顺序填写 AMS 槽位编号（0–15）');
  await fs.mkdir(path.join(dataDir, 'charms'), { recursive: true });
  const filename = `${randomUUID()}.gcode.3mf`;
  await fs.writeFile(path.join(dataDir, 'charms', filename), buffer, { flag: 'wx' });
  const manifest = await readManifest();
  manifest[name] = { file: `charms/${filename}`, plateIndex, useAms: Boolean(useAms), amsSlots: useAms ? amsSlots : [], updatedAt: new Date().toISOString() };
  const tmp = `${manifestPath}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(manifest, null, 2));
  await fs.rename(tmp, manifestPath);
  return { name, ...manifest[name] };
}
export async function resolveCharm(name) {
  const item = (await readManifest())[name];
  if (!item) throw new Error(`尚未导入「${name}」的切片盘文件，请先在页面底部配置灯符文件`);
  const filePath = path.resolve(dataDir, item.file);
  if (!filePath.startsWith(dataDir + path.sep)) throw new Error('灯符路径超出数据目录');
  const { plates } = await inspect3mf(await fs.readFile(filePath));
  const plate = plates.find(p => p.plateIndex === item.plateIndex);
  if (!plate) throw new Error('切片文件的打印板与配置不匹配');
  return { ...item, ...plate, name, filePath };
}
