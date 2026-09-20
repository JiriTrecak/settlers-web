import {records,writeManifest} from '../../tooling/asset-studio/server/manifest';
import {readPublished,planPublication} from '../../tooling/asset-studio/server/authoring/publication';
import {commitFiles} from '../../tooling/asset-studio/server/transaction';
import {withWorkspaceWriteLock} from '../../tooling/asset-studio/server/writeLock';
await withWorkspaceWriteLock(process.cwd(),async()=>{
const root=process.cwd(),released=await readPublished(root);
if(released){const plan=await planPublication(root,released,new Set());if(plan.writes.length)await commitFiles(root,plan.writes);console.log(`Validated ${released.length} canonical published assets.`);}
else{const manifest=await writeManifest(root,await records(root));console.log(`Validated ${manifest.records.length} published asset records.`);}

});
