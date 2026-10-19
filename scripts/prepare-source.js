import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import {parseStringPromise, Builder} from 'xml2js';
import {readCharmPlates} from '../src/source-catalog.js';

const source = process.argv[2] || './data/九辰灯符（上传版）.3mf';
const target = process.argv[3] || './data/九辰灯符-X2D-蓝白PLA.3mf';
if (path.resolve(source) === path.resolve(target)) throw new Error('请使用另一个输出文件，保留原始模型');
await readCharmPlates(source); // Require exactly the seven named plates before adapting.
const zip = await JSZip.loadAsync(await fs.readFile(source));
const settings = JSON.parse(await zip.file('Metadata/project_settings.config').async('string'));
Object.assign(settings, {filament_map: ['1','1'], filament_map_2: ['0','0'], filament_map_mode: 'Manual', filament_colour: ['#0A2989','#FFFFFF'], filament_type: ['PLA','PLA']});
zip.file('Metadata/project_settings.config', JSON.stringify(settings, null, 2));
const model = await parseStringPromise(await zip.file('Metadata/model_settings.config').async('string'));
for (const plate of model.config.plate || []) {
  plate.metadata = (plate.metadata || []).filter(m => !['filament_map_mode', 'filament_maps'].includes(m.$.key));
  plate.metadata.push({$: {key:'filament_map_mode',value:'Manual'}}, {$: {key:'filament_maps',value:'1 1'}});
}
zip.file('Metadata/model_settings.config', new Builder().buildObject(model));
await fs.writeFile(target, await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
console.log(`已生成双 PLA / 单主喷嘴映射的待切片项目：${target}`);
