import {readPackages} from '../../tooling/asset-studio/server/authoring/packages';
import {planPublication,readPublished} from '../../tooling/asset-studio/server/authoring/publication';
import {commitFiles} from '../../tooling/asset-studio/server/transaction';
import {withWorkspaceWriteLock} from '../../tooling/asset-studio/server/writeLock';
await withWorkspaceWriteLock(process.cwd(),async()=>{
const root=process.cwd(),apply=process.argv.includes('--apply');
if(await readPublished(root))throw Error('Canonical publication is already initialized; publish individual assets through the editor or MCP');
const assets=(await readPackages(root)).filter(a=>a.status==='published');
const plan=await planPublication(root,assets,new Set(assets.map(a=>a.id)));
console.log(JSON.stringify({assets:assets.length,records:plan.manifest.records.length,writes:plan.writes.length,bytes:plan.writes.reduce((n,w)=>n+w.bytes.length,0),apply},null,2));
if(apply){await commitFiles(root,plan.writes);console.log('Canonical runtime publication committed.');}

});
