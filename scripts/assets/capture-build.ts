/** Save a successful disposable build back into its canonical draft. Publication
 * remains explicit, using the same asset.publish command as the workbench. */
import {resizeModelTextures} from '../../tooling/asset-studio/server/authoring/textureExport';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {hash} from '../../tooling/asset-studio/server/storage';
import {readPackages,definitionBytes} from '../../tooling/asset-studio/server/authoring/packages';
import {assetFolder,resourceFilename} from '../../src/shared/authoring/asset';
import {commitFiles} from '../../tooling/asset-studio/server/transaction';
import {withWorkspaceWriteLock} from '../../tooling/asset-studio/server/writeLock';
const root=process.cwd(),id=process.argv[2];
await withWorkspaceWriteLock(root,async()=>{
 const assets=await readPackages(root),asset=assets.find(a=>a.id===id);if(!asset)throw Error('Unknown canonical asset');
 const buildResource=asset.resources.find(r=>r.role==='build');if(!buildResource)throw Error('No build manifest');
 const build=JSON.parse(await readFile(assetFolder(id)+'/'+resourceFilename(buildResource),'utf8'));
 const folder=path.resolve(root,'.asset-work/build',build.category,build.slug);
 if(!folder.startsWith(path.resolve(root,'.asset-work/build')+path.sep))throw Error('Invalid build directory');
 const writes=new Map<string,Buffer>();
 const originalHashes=new Map(asset.resources.map(r=>[r.role+'/'+r.index,r.sha256]));
 for(const [logical,ref] of Object.entries(build.files) as [string,{asset:string;role:string;index:number}][]){
  if(ref.asset!==id)continue;
  const p=path.resolve(folder,logical);if(!p.startsWith(folder+path.sep))throw Error('Invalid build input');
  const r=asset.resources.find(r=>r.role===ref.role&&r.index===ref.index)!;
  const raw=await readFile(p);
  const bytes=r.role==='geometry'&&r.format==='glb'&&asset.exportSettings?await resizeModelTextures(raw,asset.exportSettings.textureSize):raw,sha256=hash(bytes);if(originalHashes.get(r.role+'/'+r.index)===sha256)continue;
  const canonical=assetFolder(id)+'/'+resourceFilename(r);
  if(writes.has(canonical)&&hash(writes.get(canonical)!)!==sha256)throw Error('Build wrote conflicting aliases: '+canonical);
  r.sha256=sha256;r.bytes=bytes.length;writes.set(canonical,bytes);
 }
 if(writes.size){asset.revision++;writes.set(assetFolder(id)+'/asset.json',definitionBytes(asset));await commitFiles(root,[...writes].map(([path,bytes])=>({path,bytes})));}
 console.log(`Saved ${writes.size? writes.size-1:0} resources to ${id}. Publish through the asset workbench after review.`);
});
