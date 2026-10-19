// Bambu Studio 2.8.2.61 ships a heading without ';'. Correct only that comment
// in a local preset copy, then re-slice. No motion or temperature commands change.
import fs from 'node:fs/promises';
import path from 'node:path';
import {config} from 'dotenv';config();
const root = process.argv[2] || process.env.BAMBU_PROFILES_ROOT || path.resolve(process.env.SLICER_PATH, '../../Resources/profiles');
const file = path.join(root,'BBL/machine/Bambu Lab X2D 0.4 nozzle template change_filament_gcode.json');
const profile = JSON.parse(await fs.readFile(file,'utf8'));
const heading = '======== X2D filament_change gcode';
if (profile.change_filament_gcode.startsWith(heading)) {
  await fs.copyFile(file, `${file}.original`);
  profile.change_filament_gcode = ';' + profile.change_filament_gcode;
  await fs.writeFile(file, JSON.stringify(profile,null,2));
  console.log('已将 X2D 模板标题改为注释；请重新切片');
} else if (profile.change_filament_gcode.startsWith(';'+heading)) console.log('X2D 模板注释已经正确');
else console.log('此版本模板没有该标题问题，未修改');
