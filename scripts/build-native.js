import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
const env = {...process.env};
if (process.platform === 'darwin' && fs.existsSync('/Library/Developer/CommandLineTools')) env.DEVELOPER_DIR ||= '/Library/Developer/CommandLineTools';
const result = spawnSync('npm', ['run','build:native'], {cwd:'node_modules/bambu-printer-mcp', env, stdio:'inherit'});
process.exit(result.status ?? 1);
