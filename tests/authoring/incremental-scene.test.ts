import {flatTerrainData} from '../../src/shared/map/terrainData';
import {describe,expect,it} from 'vitest';
import {compileMapScene,projectMapObjects,type CompiledMapScene} from '../../src/shared/authoring/mapScene';
import {updateMapScene} from '../../src/shared/authoring/updateMapScene';
import {testLandscape} from './landscape';
import {authoredObjectSchema,type AuthoredObject} from '../../src/shared/authoring/layers';
import {proceduralFixture} from './fixture';

const object=(id:string,x:number,z:number,heightMode:'terrain'|'absolute'='terrain')=>authoredObjectSchema.parse({id,x,z,asset:'asset.models.environment.canopy-oak',heightMode});
function fixture(){const map=proceduralFixture();map.authoring!.objects=[object('oak',127,129),object('second',128,129),object('raised',120,120,'absolute')];return map;}
function sameResult(a:CompiledMapScene,b:CompiledMapScene){
 expect(a.stamps).toEqual(b.stamps);expect(a.resources).toEqual(b.resources);expect(a.owners).toEqual(b.owners);
 expect(a.generated).toEqual(b.generated);expect(a.field.samples).toEqual(b.field.samples);
 expect(a.field.grassCoverage).toEqual(b.field.grassCoverage);expect(a.field.forestCoverage).toEqual(b.field.forestCoverage);
}

describe('pose-only scene compilation',()=>{
 it('matches a full compile after reordered rotations, elevations and locks, including river warnings and resource transforms',()=>{
  const before=fixture(),compiled=compileMapScene(before,testLandscape);
  const [oak,second,raised]=before.authoring!.objects;
  const map={...before,authoring:{...before.authoring!,objects:[{...raised,elevation:4,yaw:1.2},{...second,yaw:.8},{...oak,yaw:.7,locked:true}]}};
  const next=updateMapScene(before,map,compiled,testLandscape),full=compileMapScene(map,testLandscape);
  expect(next.generated!.issues.filter(i=>i.code==='object-water-conflict').map(i=>i.id)).toEqual(['second','oak']);
  expect(next.stamps.find(s=>s.id==='raised')?.sourceTransform?.height).toBe(4);
  expect(next.resources.find(r=>r.id==='oak')?.rotation).toBeCloseTo(.7*180/Math.PI);
  sameResult(next,full);sameResult(updateMapScene(map,before,next,testLandscape),compiled);
 });
 it.each<Partial<AuthoredObject>>([{x:110},{z:110},{scale:2},{visible:false},{heightMode:'absolute'},{asset:'asset.models.environment.frost-pine-a'}])('invalidates generation for surface inputs %j',change=>{
  const before=fixture(),compiled=compileMapScene(before,testLandscape);
  const map={...before,authoring:{...before.authoring!,objects:before.authoring!.objects.map((o,i)=>i===0?{...o,...change}:o)}};
  const next=updateMapScene(before,map,compiled,testLandscape);
  sameResult(next,compileMapScene(map,testLandscape));
 });
 it('rejects duplicate IDs and invalid pose values on the reuse path',()=>{
  const before=fixture(),compiled=compileMapScene(before,testLandscape);
  for(const objects of [[before.authoring!.objects[0],before.authoring!.objects[0],before.authoring!.objects[2]],before.authoring!.objects.map(o=>({...o,yaw:NaN}))]){
   expect(()=>updateMapScene(before,{...before,authoring:{...before.authoring!,objects}},compiled,testLandscape)).toThrow();
  }
 });
 it('invalidates reused terrain when layers or map water change',()=>{
  const before=fixture(),compiled=compileMapScene(before,testLandscape);
  const maps=[{...before,authoring:{...before.authoring,terrain:flatTerrainData(before.size,0,-3)}},{...before,authoring:{...before.authoring!,layers:before.authoring!.layers.filter(l=>l.id!=='stream')}}];
  for(const map of maps)sameResult(updateMapScene(before,map,compiled,testLandscape),compileMapScene(map,testLandscape));
 });
});

it('matches a full compile after a pose-only commit followed by movement, without mutating the earlier compile',()=>{
 const before=fixture(),compiled=compileMapScene(before,testLandscape);
 const originalObjects=JSON.stringify(compiled.generated!.objects),originalHeights=compiled.field.samples.slice();
 const pose={...before,authoring:{...before.authoring!,objects:before.authoring!.objects.map(o=>({...o,yaw:.8}))}};
 const posed=updateMapScene(before,pose,compiled,testLandscape);
 const map={...pose,authoring:{...pose.authoring,objects:pose.authoring.objects.map(o=>({...o,x:o.x+10,z:o.z+8}))}};
 const moved=updateMapScene(pose,map,posed,testLandscape),full=compileMapScene(map,testLandscape);
 sameResult(moved,full);
 expect(JSON.stringify(compiled.generated!.objects)).toBe(originalObjects);expect(compiled.field.samples).toEqual(originalHeights);
 const changedRecipe={...map,authoring:{...map.authoring,layers:map.authoring.layers.map(l=>({...l,seed:l.seed+1}))}};
 sameResult(compileMapScene(changedRecipe,testLandscape,moved),compileMapScene(changedRecipe,testLandscape));
 const revised=testLandscape.map(a=>a.recipe?.type==='forest'?{...a,recipe:{...a.recipe,maxSlope:.05}}:a);
 sameResult(compileMapScene(map,revised,moved),compileMapScene(map,revised));
});

it('rechecks cached candidates against blockers, spacing and meadow bands through repeated moves and undo',()=>{
 const before=fixture(),forest=before.authoring!.layers.find(l=>l.id==='forest')!;
 before.authoring!.layers.push({...forest,id:'meadow',recipe:'recipe.meadow.woodland-edge',order:10});
 // A large blocker changes the forest and consequently the grass/tree-distance bands.
 before.authoring!.objects[0]={...before.authoring!.objects[0],x:112,z:112,scale:5};
 let previous=before,compiled=compileMapScene(before,testLandscape);
 const original=compiled,originalObjects=JSON.stringify(compiled.generated!.objects);
 for(const [x,z] of [[142,142],[115,139],[112,112]]){
  const next={...before,authoring:{...before.authoring!,objects:before.authoring!.objects.map((o,i)=>i===0?{...o,x,z}:o)}};
  const incremental=updateMapScene(previous,next,compiled,testLandscape);
  sameResult(incremental,compileMapScene(next,testLandscape));
  previous=next;compiled=incremental;
 }
 expect(JSON.stringify(original.generated!.objects)).toBe(originalObjects);
 sameResult(compiled,original);
});


it('reprojects changed poses, catalogues and map bounds',()=>{
 const before=fixture(),compiled=compileMapScene(before,testLandscape);
 const nextMap={...before,authoring:{...before.authoring!,objects:before.authoring!.objects.map((o,i)=>i===2?{...o,yaw:.3}:o)}};
 const next=updateMapScene(before,nextMap,compiled,testLandscape);
 sameResult(next,compileMapScene(nextMap,testLandscape));
 expect(next.stamps.find(s=>s.id==='raised')?.sourceTransform).not.toEqual(compiled.stamps.find(s=>s.id==='raised')?.sourceTransform);
 const changedAssets=testLandscape.map(a=>a.id==='asset.models.environment.canopy-oak'?{...a,scenery:'changed-oak'}:a);
 expect(projectMapObjects(nextMap,next.generated!,changedAssets).stamps.find(s=>s.id==='raised')?.asset).toBe('changed-oak');
 const outside=object('outside',300,300),large={...before,size:512 as const,authoring:{...before.authoring!,objects:[outside]}};
 const small=projectMapObjects({...large,size:256},compiled.generated!,testLandscape);
 expect(small.resources.some(r=>r.id==='outside')).toBe(false);
 expect(small.stamps.some(s=>s.id==='outside')).toBe(true);
 expect(projectMapObjects(large,compiled.generated!,testLandscape).resources.some(r=>r.id==='outside')).toBe(true);
});

it('rechecks ordered resource-cell ownership even when per-object projections are cached',()=>{
 const before=fixture(),compiled=compileMapScene(before,testLandscape),a=object('a',100,100),b=object('b',100,100);
 const project=(objects:AuthoredObject[])=>projectMapObjects({...before,authoring:{...before.authoring!,objects}},compiled.generated!,testLandscape).resources.filter(r=>r.id==='a'||r.id==='b').map(r=>r.id);
 expect(project([a,b])).toEqual(['a']);expect(project([b,a])).toEqual(['b']);expect(project([a,b])).toEqual(['a']);
});

it('merges a cached generated tail with authored resources, preserving order, visibility and invalidation',()=>{
 const base=fixture(),compiled=compileMapScene(base,testLandscape);
 const generated={...compiled.generated!,objects:[
  {...object('generated-a',100,100),owner:'forest'},
  {...object('generated-b',100,100),owner:'forest'},
  {...object('generated-hidden',103,104),owner:'forest',visible:false},
  {...object('generated-outside',300,300),owner:'forest'},
  {...object('generated-raised',105,106,'absolute'),owner:'forest'},
 ]};
 const a=object('authored-a',100,100),b=object('authored-b',100,100);
 const compare=(map:typeof base,scene=generated,catalogue=testLandscape)=>{
  const actual=projectMapObjects(map,scene,catalogue);
  // Author-only projection is the exhaustive reference: it visits every record
  // in order and has no generated collection available to reuse.
  const reference=projectMapObjects({...map,authoring:{...map.authoring!,objects:[...map.authoring!.objects,...scene.objects]}},{...scene,objects:[]},catalogue);
  expect(actual).toEqual(reference);return actual;
 };
 for(const objects of [[a,b],[b,a],[{...a,x:101},b],[{...a,visible:false}],[]]){
  compare({...base,authoring:{...base.authoring!,objects}});
 }
 compare({...base,size:512,authoring:{...base.authoring!,objects:[]}});
 compare(base,{...generated,objects:[...generated.objects].reverse()});
 compare(base,generated,testLandscape.map(asset=>asset.id==='asset.models.environment.canopy-oak'?{...asset,scenery:'alternate-oak'}:asset));
});
