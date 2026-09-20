import {withWorkspaceWriteLock} from '../../tooling/asset-studio/server/writeLock';
import {readPublished,planPublication} from '../../tooling/asset-studio/server/authoring/publication';
import {definitionBytes} from '../../tooling/asset-studio/server/authoring/packages';
import {assetDefinitionSchema,assetFolder} from '../../src/shared/authoring/asset';
import {commitFiles} from '../../tooling/asset-studio/server/transaction';
await withWorkspaceWriteLock(process.cwd(),async()=>{
 const root=process.cwd(),assets=(await readPublished(root))!,changed=new Set<string>();
 const scatter={species:[{asset:'asset.models.environment.grass.reference-grass-high-a',weight:2},{asset:'asset.models.environment.grass.reference-grass-high-b',weight:1}],density:1,pattern:'patches',spacing:.8,minSpacing:.35,probability:.65,jitter:.8,scaleMin:.65,scaleMax:1.1,maxSlope:1.5,waterClearance:.2,objectClearance:.6,edgeFade:1,patchiness:{scale:5,strength:.65}};
 const next=assets.map(a=>{
  if(a.id==='asset.placeholder.missing-model'){
   changed.add(a.id);return assetDefinitionSchema.parse({...a,revision:a.revision+1,bindings:{...a.bindings,scenery:a.bindings.scenery.filter(s=>s.id==='missing-model'),render:a.bindings.render.map(b=>({...b,...(b.sceneryAsset?{sceneryAsset:'missing-model'}:{})}))}});
  }
  if(a.recipe?.type==='river'){
   changed.add(a.id);return assetDefinitionSchema.parse({...a,name:a.id.endsWith('swift')?'Scouring · swift river':'Scouring · gentle river',revision:a.revision+1,recipe:{...a.recipe,details:{banks:scatter,water:{...scatter,species:[{asset:'asset.models.environment.grass.reference-grass-water-leaves-a',weight:2},{asset:'asset.models.environment.grass.reference-grass-water-leaves-b',weight:1}],spacing:1.8,minSpacing:1.4,probability:.6,waterClearance:0,scaleMin:.7,scaleMax:1.1}}}});
  }
  return a;
 });
 const plan=await planPublication(root,next,changed);
 await commitFiles(root,[...next.filter(a=>changed.has(a.id)).map(a=>({path:assetFolder(a.id)+'/asset.json',bytes:definitionBytes(a)})),...plan.writes]);
 console.log('Published source-style rivers and removed retired scenery aliases.');
});
