import fs from 'node:fs/promises';
import JSZip from 'jszip';
import { parseStringPromise } from 'xml2js';
import { CHARM_NAMES } from './catalog.js';

export async function readCharmPlates(projectPath = process.env.CHARM_PROJECT_3MF) {
  if (!projectPath) throw new Error('缺少 CHARM_PROJECT_3MF');
  const archive = await JSZip.loadAsync(await fs.readFile(projectPath));
  const info = archive.file('Metadata/slice_info.config');
  if (!info) throw new Error('3MF 缺少打印板清单');
  const xml = await parseStringPromise(await info.async('string'));
  const plates = [];
  for (const plate of xml.config.plate || []) {
    const objects = (plate.object || []).filter(o => o.$?.skipped !== 'true');
    const name = objects[0]?.$?.name?.replace(/\.stl$/i, '');
    if (!CHARM_NAMES.includes(name)) continue;
    if (objects.length !== 1) throw new Error(`「${name}」板包含额外对象，请检查模型`);
    if (plates.some(p => p.name === name)) throw new Error(`「${name}」存在重复命名板，无法自动选择`);
    const metadata = Object.fromEntries((plate.metadata || []).map(m => [m.$.key, m.$.value]));
    const plateIndex = Number(metadata.index) - 1;
    if (!Number.isInteger(plateIndex) || plateIndex < 0) throw new Error('打印板编号无效');
    plates.push({ name, plateIndex, timeSeconds: Number(metadata.prediction), grams: Number(metadata.weight), filaments: (plate.filament || []).map(f => ({ type: f.$.type, color: f.$.color, grams: Number(f.$.used_g) })) });
  }
  if (plates.length !== CHARM_NAMES.length) throw new Error(`只找到 ${plates.length}/7 款有命名灯符`);
  return plates;
}
