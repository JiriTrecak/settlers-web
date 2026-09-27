/** Prepare a smaller canonical draft, retaining exact original GLBs as sources.
 * Usage: node --import tsx scripts/assets/texture-size.ts asset.id 512 */
import {readFile} from 'node:fs/promises';
import {resizeModelTextures} from '../../tooling/asset-studio/server/authoring/textureExport';
import {readPackages,definitionBytes} from '../../tooling/asset-studio/server/authoring/packages';
import {assetFolder,resourceFilename} from '../../src/shared/authoring/asset';
import {hash} from '../../tooling/asset-studio/server/storage';
import {commitFiles} from '../../tooling/asset-studio/server/transaction';
import {withWorkspaceWriteLock} from '../../tooling/asset-studio/server/writeLock';
await withWorkspaceWriteLock(process.cwd(),async()=>{
 const asset=(await readPackages(process.cwd())).find(a=>a.id===process.argv[2]);if(!asset)throw Error('Unknown asset');
 const writes:{path:string;bytes:Buffer}[]=[];
 const limit=Number(process.argv[3]??512);if(![128,256,512,1024,2048,4096].includes(limit))throw Error('Unsupported texture size');
 const policyChanged=asset.exportSettings?.textureSize!==limit;asset.exportSettings={textureSize:limit as 512};
 for(const r of [...asset.resources].filter(r=>r.role==='geometry'&&r.format==='glb')){
  const filename=assetFolder(asset.id)+'/'+resourceFilename(r),original=await readFile(filename),bytes=await resizeModelTextures(original,limit);if(bytes===original)continue;
  if(!asset.resources.some(s=>s.role==='source'&&s.sha256===hash(original))){const source={...r,role:'source' as const,index:1+Math.max(0,...asset.resources.filter(r=>r.role==='source').map(r=>r.index))};asset.resources.push(source);writes.push({path:assetFolder(asset.id)+'/'+resourceFilename(source),bytes:original});}
  r.bytes=bytes.length;r.sha256=hash(bytes);writes.push({path:filename,bytes});console.log(`${asset.id}: ${original.length} → ${bytes.length} bytes`);
 }
 if(writes.length||policyChanged){asset.revision++;writes.push({path:assetFolder(asset.id)+'/asset.json',bytes:definitionBytes(asset)});await commitFiles(process.cwd(),writes);}
 console.log('Draft prepared. Inspect and publish from the Asset Workbench.');
});
