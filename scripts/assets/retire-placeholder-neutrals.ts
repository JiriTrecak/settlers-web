/** Retire the temporary neutral roster (wolf, ogre, thornspitter, staglord, matriarch) now that the
 * modelled forest creeps replace it: drop their missing-model render bindings and archive their icons.
 * One locked transaction, same publication plan as the workbench's archive operation. */
import {assetDefinitionSchema,assetFolder} from '../../src/shared/authoring/asset';
import {definitionBytes} from '../../tooling/asset-studio/server/authoring/packages';
import {readPublished,planPublication} from '../../tooling/asset-studio/server/authoring/publication';
import {MISSING_MODEL_ID} from '../../tooling/asset-studio/server/authoring/placeholder';
import {withWorkspaceWriteLock} from '../../tooling/asset-studio/server/writeLock';
import {commitFiles} from '../../tooling/asset-studio/server/transaction';

const slugs=['wolf','ogre','thornspitter','amberjaw-staglord','thornblade-matriarch'];
const renders=new Set(slugs.map(slug=>`asset.neutral.${slug}`));
const icons=new Set(slugs.map(slug=>`asset.icons.unit-neutral-${slug}`));

await withWorkspaceWriteLock(process.cwd(),async()=>{
 const root=process.cwd(),released=await readPublished(root);if(!released)throw Error('Canonical asset registry is required');
 const current=released.find(a=>a.id===MISSING_MODEL_ID);if(!current)throw Error('Missing-model placeholder is not published');
 const placeholder=assetDefinitionSchema.parse({...current,revision:current.revision+1,
  bindings:{...current.bindings,render:current.bindings.render.filter(b=>!renders.has(b.id))}});
 const archived=released.filter(a=>icons.has(a.id)).map(a=>assetDefinitionSchema.parse({...a,status:'archived',revision:a.revision+1}));
 if(current.bindings.render.length-placeholder.bindings.render.length!==renders.size||archived.length!==icons.size)
  throw Error('Temporary neutral roster is already retired or incomplete');
 const assets=[...released.filter(a=>a.id!==MISSING_MODEL_ID&&!icons.has(a.id)),placeholder];
 const plan=await planPublication(root,assets,new Set([MISSING_MODEL_ID]));
 await commitFiles(root,[{path:assetFolder(MISSING_MODEL_ID)+'/asset.json',bytes:definitionBytes(placeholder)},
  ...archived.map(a=>({path:assetFolder(a.id)+'/asset.json',bytes:definitionBytes(a)})),...plan.writes]);
 console.log('Retired',[...renders],'and archived',[...icons]);
});
