/** Bundle the actual runtime before measuring it, avoiding development-loader
 * import wrappers. Still headless: browser transport and HUD require a trace. */
import {mkdirSync,mkdtempSync,rmSync,copyFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {build} from 'vite';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const args=process.argv.slice(2),peerIndex=args.indexOf('--four-peer');
const entry=peerIndex<0?'match-budget':'four-peer-match';
if(peerIndex>=0)args.splice(peerIndex,1);
const configIndex=args.indexOf('--vite-config');
let configFile=false;
if(configIndex!==-1){
  const path=args[configIndex+1];
  if(!path||path.startsWith('--'))throw Error('--vite-config requires a file path');
  configFile=resolve(root,path);args.splice(configIndex,2);
}
console.log(JSON.stringify({benchmarkRuntime:process.version,executable:process.execPath,variant:configFile||'production',entry}));
const scratch=resolve(root,'.asset-work');mkdirSync(scratch,{recursive:true});
const outDir=mkdtempSync(resolve(scratch,'bench-match-'));
try {
  await build({
    configFile,root,logLevel:'warn',
    build:{
      ssr:resolve(root,`scripts/bench/${entry}.ts`),outDir,emptyOutDir:true,
      minify:false,sourcemap:true,
      rollupOptions:{output:{entryFileNames:'match-budget.mjs'}},
    },
  });
  const result=spawnSync(process.execPath,[resolve(outDir,'match-budget.mjs'),...args],{cwd:root,stdio:'inherit'});
  if(result.error)throw result.error;
  // Profiles contain generated bundle locations. Retain the matching source and
  // source map next to them so allocation/CPU stacks remain actionable after
  // the temporary build is removed. Nothing is retained for ordinary runs.
  for(const flag of ['--cpu-profile','--allocation-profile']){
    const at=args.indexOf(flag),destination=at<0?undefined:args[at+1];
    if(!destination)continue;
    copyFileSync(resolve(outDir,'match-budget.mjs'),resolve(root,destination+'.bundle.mjs'));
    copyFileSync(resolve(outDir,'match-budget.mjs.map'),resolve(root,destination+'.bundle.mjs.map'));
  }
  process.exitCode=result.status??1;
} finally {
  rmSync(outDir,{recursive:true,force:true});
}
