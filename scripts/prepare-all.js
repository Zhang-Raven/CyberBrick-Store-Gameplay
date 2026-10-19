import fs from 'node:fs/promises';
import path from 'node:path';
import {config} from 'dotenv';config();
import {prepareCharm} from '../src/real-agent.js';
import {readCharmPlates} from '../src/source-catalog.js';
import {registerCharm} from '../src/charm-assets.js';
import {closePrinterMcp} from '../src/printer-mcp.js';
import {inspectPrintFile} from '../node_modules/bambu-printer-mcp/dist/safety/print-file.js';

try {
  const charms = await readCharmPlates();
  for (const charm of charms) {
    const prepared = await prepareCharm(charm, undefined, {forceSlice:true});
    const inspection = await inspectPrintFile(prepared.filePath, {model:'x2d',plateIndex:prepared.plateIndex,bedType:'textured_plate'});
    const entry = await registerCharm({name:charm.name,buffer:await fs.readFile(prepared.filePath),plateIndex:prepared.plateIndex,useAms:true,amsSlots:[0,3]});
    console.log(JSON.stringify({charm:charm.name,plate:prepared.plateIndex+1,file:entry.file,sha256:inspection.sha256,nozzle:inspection.nozzleDiameters,materials:inspection.materials,maxNozzle:inspection.maxNozzleTemperature,maxBed:inspection.maxBedTemperature}));
  }
} finally {await closePrinterMcp();}
