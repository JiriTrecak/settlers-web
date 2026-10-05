import {verifyImage} from './media.ts';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,copyFile,access,readdir,stat} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,basename} from 'node:path';
import {artifactSchema,digestFile,verifySignature,platformSchema} from './artifacts.ts';
import {releaseLog,compareVersions} from '../../src/shared/release/schema.ts';
const config=JSON.parse(await readFile('src-tauri/tauri.conf.json','utf8'));
const log=releaseLog.parse(JSON.parse(await readFile('releases/log.json','utf8')));
const entry=log.releases.find(r=>r.version===config.version);if(!entry)throw Error('Prepare the release log before building');
for(const release of log.releases.filter(r=>compareVersions(r.version,config.version)<=0))for(const image of release.images??[])await verifyImage('releases/media',image);
if(!process.env.TAURI_SIGNING_PRIVATE_KEY)await access(join(homedir(),'.config/under-the-canopy/updater.key')).catch(()=>{throw Error('Release signing key is missing. Local unsigned builds cannot be published.');});
const platform=platformSchema.parse(`${process.platform==='win32'?'windows':process.platform}-${process.arch==='arm64'?'aarch64':process.arch==='x64'?'x86_64':process.arch}`);
const bundles=process.platform==='darwin'?'app':process.platform==='win32'?'nsis':'appimage';
execFileSync(process.execPath,['scripts/desktop.mjs','build','--bundles',bundles],{stdio:'inherit'});
const folder=join('src-tauri/target/release/bundle',process.platform==='darwin'?'macos':process.platform==='win32'?'nsis':'appimage');
const extension=process.platform==='darwin'?'.app.tar.gz':process.platform==='win32'?'.exe':'.AppImage';
const files=(await readdir(folder)).filter(f=>f.endsWith(extension));if(files.length!==1)throw Error(`Expected one updater package in ${folder}; remove stale packages before building`);
const input=join(folder,files[0]);
if(process.platform==='darwin'){
 const app=files[0].slice(0,-7); // .app.tar.gz -> .app
 const version=execFileSync('/usr/libexec/PlistBuddy',['-c','Print :CFBundleShortVersionString',join(folder,app,'Contents/Info.plist')],{encoding:'utf8'}).trim();
 if(version!==config.version)throw Error('Built app version differs from the release log');
}
const signature=(await readFile(input+'.sig','utf8')).trim(),digest=await digestFile(input);
verifySignature(config.plugins.updater.pubkey,signature,digest.prehash,config.version);
const filename=`under-the-canopy-${config.version}-${platform}${extension}`;
const artifact=artifactSchema.parse({schemaVersion:1,version:config.version,platform,filename,sha256:digest.sha256,bytes:digest.bytes,signature,changelog:entry});
const out=join('build/releases',config.version,platform);await mkdir(out,{recursive:true});
if(entry.images?.length){await mkdir(join(out,'media'),{recursive:true});for(const image of entry.images)await copyFile(await verifyImage('releases/media',image),join(out,'media',image.file));}
await copyFile(input,join(out,filename));await writeFile(join(out,filename+'.sig'),signature+'\n');
await writeFile(join(out,'artifact.json'),JSON.stringify(artifact,null,2)+'\n');
await writeFile(join(out,'changelog.json'),JSON.stringify(entry,null,2)+'\n');
// Catch mismatched/stale outputs and ensure provenance is kept beside the upload.
if((await stat(join(out,basename(filename)))).size!==artifact.bytes)throw Error('Staged package size mismatch');
console.log(`Verified release staged at ${out}/artifact.json`);
