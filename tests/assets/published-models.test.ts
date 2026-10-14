import {expect,it} from 'vitest';
import {readPublished,planPublication} from '../../tooling/asset-studio/server/authoring/publication';

// Content validation over whatever is published right now. No asset is named and nothing is counted:
// the release is re-checked through the same gate `npm run assets:compile` and the asset studio use
// (dependencies, resource hashes, model budgets per class including attachments, skin weights,
// animation clips/events, sockets, material slots, icon sizes, weapon geometry, map references).
// Definition -> model/icon binding is already enforced by ContentRegistry, and duplicate render IDs by
// the manifest compiler, so they are not restated here.
it('the current release passes the publication gate with nothing left to compile',async()=>{
 const root=process.cwd(),released=await readPublished(root);
 expect(released).toBeDefined();
 const plan=await planPublication(root,released!,new Set());
 expect(plan.writes.map(w=>w.path)).toEqual([]);
},180_000);
