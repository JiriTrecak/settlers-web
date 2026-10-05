/** Launch the game desktop CLI, including from GUI shells without rustup on PATH. */
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {delimiter,join} from 'node:path';
import {createRequire} from 'node:module';

const env={...process.env};
if(spawnSync('cargo',['--version'],{env,stdio:'ignore'}).error?.code==='ENOENT'){
  const cargoBin=join(env.CARGO_HOME || join(homedir(),'.cargo'),'bin');
  if(existsSync(join(cargoBin,process.platform==='win32'?'cargo.exe':'cargo')))
    env.PATH=cargoBin+delimiter+(env.PATH??'');
}
const require=createRequire(import.meta.url);
const result=spawnSync(process.execPath,[require.resolve('@tauri-apps/cli/tauri.js'),...process.argv.slice(2)],{env,stdio:'inherit'});
if(result.error)console.error(result.error.message);
process.exit(result.status??1);
