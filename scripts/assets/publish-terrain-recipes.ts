import {readFile} from 'node:fs/promises';
import {withWorkspaceWriteLock} from '../../tooling/asset-studio/server/writeLock';
import {readPublished,planPublication} from '../../tooling/asset-studio/server/authoring/publication';
import {definitionBytes} from '../../tooling/asset-studio/server/authoring/packages';
import {assetDefinitionSchema,assetFolder} from '../../src/shared/authoring/asset';
import {commitFiles} from '../../tooling/asset-studio/server/transaction';
/** Publish both reusable landforms through the same atomic asset pipeline as the editor. */
await withWorkspaceWriteLock(process.cwd(),async()=>{
 const root=process.cwd(),all=(await readPublished(root))!,index=new Map(all.map(a=>[a.id,a]));
 const changed=new Set<string>();
 for(const slug of ['bank','mountain']){
  const asset=assetDefinitionSchema.parse(JSON.parse(await readFile(assetFolder('recipe.terrain.'+slug)+'/asset.json','utf8')));
  index.set(asset.id,asset);changed.add(asset.id);
 }
 const plan=await planPublication(root,[...index.values()],changed);
 await commitFiles(root,[...[...changed].map(id=>({path:assetFolder(id)+'/asset.json',bytes:definitionBytes(index.get(id)!)})),...plan.writes]);
 console.log('Published terrain recipes:',[...changed]);
});
