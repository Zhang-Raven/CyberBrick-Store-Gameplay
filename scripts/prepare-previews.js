import fs from 'node:fs/promises';
import path from 'node:path';
import {dataDir,readManifest} from '../src/charm-assets.js';
import {renderToolpathPreview} from '../src/toolpath-preview.js';
await fs.mkdir(path.join(dataDir,'previews'),{recursive:true});
for(const [name,item] of Object.entries(await readManifest())){
 const svg=await renderToolpathPreview(path.join(dataDir,item.file),item.plateIndex,name);
 await fs.writeFile(path.join(dataDir,'previews',`${name}.svg`),svg);
 console.log(`${name}: preview ready`);
}
