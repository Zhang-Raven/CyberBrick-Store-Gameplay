import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import JSZip from 'jszip';
import {inspectPrintFile} from '../node_modules/bambu-printer-mcp/dist/safety/print-file.js';
const root = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const assets = JSON.parse(await fs.readFile(path.join(root,'data/charms.json'),'utf8'));
const template = assets['贪狼'];
const options = {model:'x2d',plateIndex:template.plateIndex,bedType:'textured_plate'};
const buffer = await fs.readFile(path.join(root,'data',template.file));
const scratch = await fs.mkdtemp(path.resolve(root,'../../work/mcp-regression-'));
async function mutated(name, change) {
  const z=await JSZip.loadAsync(buffer),plate=`Metadata/plate_${template.plateIndex+1}.gcode`;
  const g=await z.file(plate).async('string');const next=change(g);assert.notEqual(next,g);
  z.file(plate,next);const file=path.join(scratch,`${name}.3mf`);await fs.writeFile(file,await z.generateAsync({type:'nodebuffer'}));return file;
}
test.after(async()=>fs.rm(scratch,{recursive:true,force:true}));
test('all seven actual X2D/PLA slices pass file inspection and contain only one G-code plate',async()=>{
  assert.equal(Object.keys(assets).length,7);
  for(const item of Object.values(assets)){
    const file=path.join(root,'data',item.file),z=await JSZip.loadAsync(await fs.readFile(file));
    assert.equal(Object.keys(z.files).filter(n=>/^Metadata\/plate_\d+\.gcode$/.test(n)).length,1);
    const i=await inspectPrintFile(file,{...options,plateIndex:item.plateIndex});
    assert.deepEqual(i.materials,['PLA','PLA']);assert.deepEqual(i.nozzleDiameters,[0.4,0.4]);assert.ok(i.maxNozzleTemperature<=240);assert.ok(i.maxBedTemperature<=55);
  }
});
test('unused-nozzle sentinel cannot authorize an excessive temperature',async()=>{
  const file=await mutated('too-hot',g=>g.replace(/M620\.17 T0 S\d+ L-1/,'M620.17 T0 S400 L-1'));
  await assert.rejects(inspectPrintFile(file,options),/temperature|400/);
});
test('other negative material positions remain rejected',async()=>{
  const file=await mutated('negative',g=>g.replace(/M620\.17 T0 S(\d+) L-1/,'M620.17 T0 S$1 L-2'));
  await assert.rejects(inspectPrintFile(file,options),/position -2/);
});
test('M104 provenance flag does not bypass heat limits',async()=>{
  const file=await mutated('M104-hot',g=>g.replace(/M104 T1 S\d+ N0/,'M104 T1 S400 N0'));
  await assert.rejects(inspectPrintFile(file,options),/temperature|400/);
});
test('unknown M104 N values remain rejected',async()=>{
  const file=await mutated('M104-N',g=>g.replace(/M104 T1 S(\d+) N0/,'M104 T1 S$1 N1'));
  await assert.rejects(inspectPrintFile(file,options),/parameter N/);
});
test('an extra command cannot hide inside the camera macro',async()=>{
  const file=await mutated('camera-command',g=>g.replace(/(M9711 M0 E1[^\r\n]+)/,'$1 M104 S400'));
  await assert.rejects(inspectPrintFile(file,options),/multiple commands/);
});
