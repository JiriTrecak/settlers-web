import type {UtcMap} from '../map/utcmap';
import type {LandscapeAsset} from './catalogue';
import {authoringSceneSchema,type AuthoredObject} from './layers';
import {compileMapScene,projectMapObjects,inheritSceneSource,reusableMapSurface,type CompiledMapScene} from './mapScene';
import {BuildProfile} from './buildProfile';

// Whitelist only fields that neither reserve vegetation space nor tint ground.
// New object fields participate in invalidation automatically.
function surfaceInputs({yaw:_,elevation:__,locked:___,...inputs}:AuthoredObject){return JSON.stringify(inputs);}

/** Immutable document edits can reuse terrain and scatter when only an object's
 * pose or lock changed. Other edits rerun generation, reusing carved terrain and
 * unchanged candidate plans when their dependencies allow it. Both paths publish
 * exactly the same projections. */
export function updateMapScene(before:UtcMap,map:UtcMap,previous:CompiledMapScene,catalogue:readonly LandscapeAsset[]):CompiledMapScene{
 const profile=new BuildProfile(),a=before.authoring,b=map.authoring;
 if(!a||!b||!previous.generated||!reusableMapSurface(map,catalogue,previous)||before.stamps!==map.stamps||a.objects.length!==b.objects.length)return compileMapScene(map,catalogue,previous);
 // Validate the fast path too: duplicate IDs and invalid poses must never bypass
 // the compiler's normal document validation.
 const next=authoringSceneSchema.parse(b),oldObjects=new Map(a.objects.map(o=>[o.id,o]));
 if(next.objects.some(o=>{const old=oldObjects.get(o.id);return !old||surfaceInputs(old)!==surfaceInputs(o);}))return compileMapScene(map,catalogue,previous);
 // Baked placements have ordered vegetation reservations; retain that ordering.
 if(JSON.stringify(a.objects.filter(o=>o.bakedPlacement).map(o=>o.id))!==JSON.stringify(next.objects.filter(o=>o.bakedPlacement).map(o=>o.id)))return compileMapScene(map,catalogue,previous);
 const waterIssues=new Map(previous.generated.issues.filter(i=>i.code==='object-water-conflict').map(i=>[i.id,i]));
 const issues=[...previous.generated.issues.filter(i=>i.code!=='object-water-conflict'),
  ...next.objects.flatMap(o=>waterIssues.has(o.id)?[waterIssues.get(o.id)!]:[]),
  ...previous.generated.issues.filter(i=>i.code==='object-water-conflict'&&!oldObjects.has(i.id))];
 const generated={...previous.generated,issues};
 profile.mark('Reuse unchanged terrain and vegetation');
 const projection=projectMapObjects(map,generated,catalogue);
 profile.mark('Resource and scenery projections');
 const result={...previous,generated,...projection,profile:profile.report()};
 inheritSceneSource(result,previous);return result;
}
