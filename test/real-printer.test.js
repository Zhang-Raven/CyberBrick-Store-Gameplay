import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import JSZip from 'jszip';
import {readCharmPlates} from '../src/source-catalog.js';
import {inspect3mf} from '../src/charm-assets.js';
import {matchedJob, monitorPrint, runRealAgent} from '../src/real-agent.js';

const project = fileURLToPath(new URL('../data/九辰灯符（上传版）.3mf', import.meta.url));
process.env.CHARM_PROJECT_3MF = project;
test('source catalog includes only the seven exact named plates, keeping original plate IDs', async () => {
  const p = await readCharmPlates(project);
  assert.deepEqual(p.map(c => [c.name, c.plateIndex+1]), [['贪狼',2],['禄存',3],['巨门',4],['廉贞',5],['武曲',6],['破军',7],['辅星',8]]);
});
test('an unsliced model cannot be registered as a printable artifact', async () => {
  await assert.rejects(inspect3mf(await fs.readFile(project)), /未切片/);
});
test('sliced plate number is taken from the G-code entry', async () => {
  const z = new JSZip();z.file('Metadata/plate_6.gcode','; printer_model = Bambu Lab X2D');
  const p = await inspect3mf(await z.generateAsync({type:'nodebuffer'}));
  assert.equal(p.plates[0].plateIndex,5);
});
test('job matching tolerates MCP checked UUID and refuses unrelated finished tasks', () => {
  const name = '武曲-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.gcode.3mf';
  assert.equal(matchedJob({print:{filename:`checked-12345678-1234-1234-1234-123456789abc-${name}`}},name),true);
  assert.equal(matchedJob({print:{filename:'old-job'}},name),false);
});
test('a stale FINISH and RUNNING at 100% do not complete the new physical task', async () => {
  const reports = [
    {connected:true,status:'FINISH',print:{filename:'old',progress:100}},
    {connected:true,status:'RUNNING',print:{filename:'new',progress:100}},
    {connected:true,status:'FINISH',print:{filename:'new',progress:100}},
  ];
  const events=[];
  const s=await monitorPrint({expectedName:'new',callTool:async()=>reports.shift(),pollMs:0,maxPolls:3,onProgress:e=>events.push(e)});
  assert.equal(s.status,'FINISH');assert.deepEqual(events.map(e=>e.status),['running','completed']);
});
test('physical error is not reported as completion',async()=>{
  await assert.rejects(monitorPrint({expectedName:'new',pollMs:0,maxPolls:1,onProgress:()=>{},callTool:async()=>({connected:true,status:'FAILED',print:{filename:'new'},raw:{print_error:123}})}),/设备报告打印错误/);
});
test('real agent sends only selected plate using X2D native transport and explicit AMS slots',async()=>{
  const calls=[];
  const result=await runRealAgent({birthYear:1990,birthMonth:5,date:'2026-10-08',onProgress:()=>{},fortuneProvider:async()=>({category:'wealth'}),prepare:async charm=>{assert.equal(charm.name,'武曲');assert.equal(charm.plateIndex,5);return {filePath:'/tmp/武曲-new.gcode.3mf',plateIndex:5,useAms:true,amsSlots:[0,3]};},callTool:async(name,args)=>{calls.push({name,args});return name==='get_printer_status'?{connected:true,status:'IDLE'}:{status:'success'};},monitor:async options=>{assert.equal(options.expectedName,'武曲-new.gcode.3mf');return {status:'FINISH',print:{progress:100}};}});
  const print=calls.find(c=>c.name==='print_3mf');assert.equal(print.args.connection_mode,'bambu_native');assert.equal(print.args.plate_index,5);assert.deepEqual(print.args.ams_slots,[0,3]);assert.equal(result.mode,'real-bambu-mcp');
});
test('a busy printer prevents slicing and dispatch',async()=>{
  await assert.rejects(runRealAgent({birthYear:1990,birthMonth:5,date:'2026-10-08',onProgress:()=>{},fortuneProvider:async()=>({category:'wealth'}),callTool:async()=>({connected:true,status:'RUNNING'}),prepare:async()=>assert.fail('must not slice while busy')}),/不可开始新任务/);
});
