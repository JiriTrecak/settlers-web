import {describe,expect,it} from 'vitest';
import {compileMapScene,projectMapObjects,type CompiledMapScene} from '../../src/shared/authoring/mapScene';
import {updateMapScene} from '../../src/shared/authoring/updateMapScene';
import {landscapeAssets} from '../../src/shared/authoring/project';
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
  const before=fixture(),compiled=compileMapScene(before,landscapeAssets);
  const [oak,second,raised]=before.authoring!.objects;
  const map={...before,authoring:{...before.authoring!,objects:[{...raised,elevation:4,yaw:1.2},{...second,yaw:.8},{...oak,yaw:.7,locked:true}]}};
  const next=updateMapScene(before,map,compiled,landscapeAssets),full=compileMapScene(map,landscapeAssets);
  expect(next.field).toBe(compiled.field);expect(next.generated!.objects).toBe(compiled.generated!.objects);
  expect(next.generated!.issues.filter(i=>i.code==='object-water-conflict').map(i=>i.id)).toEqual(['second','oak']);
  expect(next.stamps.find(s=>s.id==='raised')?.sourceTransform?.height).toBe(4);
  expect(next.resources.find(r=>r.id==='oak')?.rotation).toBeCloseTo(.7*180/Math.PI);
  sameResult(next,full);sameResult(updateMapScene(map,before,next,landscapeAssets),compiled);
 });
 it.each<Partial<AuthoredObject>>([{x:110},{z:110},{scale:2},{visible:false},{heightMode:'absolute'},{asset:'asset.models.environment.frost-pine-a'},{bakedFrom:'forest',bakedPlacement:{stage:1,order:1,blocksVegetation:true}}])('invalidates generation for surface inputs %j',change=>{
  const before=fixture(),compiled=compileMapScene(before,landscapeAssets);
  const map={...before,authoring:{...before.authoring!,objects:before.authoring!.objects.map((o,i)=>i===0?{...o,...change}:o)}};
  const next=updateMapScene(before,map,compiled,landscapeAssets);
  expect(next.field).not.toBe(compiled.field);sameResult(next,compileMapScene(map,landscapeAssets));
 });
 it('rejects duplicate IDs and invalid pose values on the reuse path',()=>{
  const before=fixture(),compiled=compileMapScene(before,landscapeAssets);
  for(const objects of [[before.authoring!.objects[0],before.authoring!.objects[0],before.authoring!.objects[2]],before.authoring!.objects.map(o=>({...o,yaw:NaN}))]){
   expect(()=>updateMapScene(before,{...before,authoring:{...before.authoring!,objects}},compiled,landscapeAssets)).toThrow();
  }
 });
 it('invalidates reused terrain when layers or map water change',()=>{
  const before=fixture(),compiled=compileMapScene(before,landscapeAssets);
  const maps=[{...before,waterLevel:-3},{...before,authoring:{...before.authoring!,layers:before.authoring!.layers.filter(l=>l.id!=='stream')}}];
  for(const map of maps){const next=updateMapScene(before,map,compiled,landscapeAssets);expect(next.field).not.toBe(compiled.field);sameResult(next,compileMapScene(map,landscapeAssets));}
 });
});

it('reuses carved surface plans on movement, including after a pose-only commit, while recomputing exclusions',()=>{
 const before=fixture(),compiled=compileMapScene(before,landscapeAssets);
 const originalObjects=JSON.stringify(compiled.generated!.objects),originalHeights=compiled.field.samples.slice();
 const pose={...before,authoring:{...before.authoring!,objects:before.authoring!.objects.map(o=>({...o,yaw:.8}))}};
 const posed=updateMapScene(before,pose,compiled,landscapeAssets);
 const map={...pose,authoring:{...pose.authoring,objects:pose.authoring.objects.map(o=>({...o,x:o.x+10,z:o.z+8}))}};
 const moved=updateMapScene(pose,map,posed,landscapeAssets),full=compileMapScene(map,landscapeAssets);
 expect(moved.generated!.terrain).toBe(compiled.generated!.terrain);
 expect(moved.generated!.rivers).toBe(compiled.generated!.rivers);
 expect(moved.generated!.objects).not.toBe(compiled.generated!.objects);
 sameResult(moved,full);
 expect(JSON.stringify(compiled.generated!.objects)).toBe(originalObjects);expect(compiled.field.samples).toEqual(originalHeights);
 const changedRecipe={...map,authoring:{...map.authoring,layers:map.authoring.layers.map(l=>({...l,seed:l.seed+1}))}};
 expect(compileMapScene(changedRecipe,landscapeAssets,moved).generated!.terrain).not.toBe(moved.generated!.terrain);
 expect(compileMapScene(map,[...landscapeAssets],moved).generated!.terrain).not.toBe(moved.generated!.terrain);
});

it('rechecks cached candidates against blockers, spacing and meadow bands through repeated moves and undo',()=>{
 const before=fixture(),forest=before.authoring!.layers.find(l=>l.id==='forest')!;
 before.authoring!.layers.push({...forest,id:'meadow',recipe:'recipe.meadow.woodland-edge',order:10});
 // A large blocker changes the forest and consequently the grass/tree-distance bands.
 before.authoring!.objects[0]={...before.authoring!.objects[0],x:112,z:112,scale:5};
 let previous=before,compiled=compileMapScene(before,landscapeAssets);
 const original=compiled,originalObjects=JSON.stringify(compiled.generated!.objects);
 for(const [x,z] of [[142,142],[115,139],[112,112]]){
  const next={...before,authoring:{...before.authoring!,objects:before.authoring!.objects.map((o,i)=>i===0?{...o,x,z}:o)}};
  const incremental=updateMapScene(previous,next,compiled,landscapeAssets);
  sameResult(incremental,compileMapScene(next,landscapeAssets));
  expect(incremental.generated!.terrain).toBe(original.generated!.terrain);
  previous=next;compiled=incremental;
 }
 expect(JSON.stringify(original.generated!.objects)).toBe(originalObjects);
 sameResult(compiled,original);
});


it('retains unchanged object projections while invalidating changed poses, catalogues and map bounds',()=>{
 const before=fixture(),compiled=compileMapScene(before,landscapeAssets);
 const nextMap={...before,authoring:{...before.authoring!,objects:before.authoring!.objects.map((o,i)=>i===2?{...o,yaw:.3}:o)}};
 const next=updateMapScene(before,nextMap,compiled,landscapeAssets);
 expect(next.owners).toBe(compiled.owners);
 const oldStamps=new Map(compiled.stamps.map(s=>[s.id,s])),oldResources=new Map(compiled.resources.map(r=>[r.id,r]));
 for(const stamp of next.stamps)if(stamp.id!=='raised')expect(stamp).toBe(oldStamps.get(stamp.id));
 for(const resource of next.resources)expect(resource).toBe(oldResources.get(resource.id));
 expect(next.stamps.find(s=>s.id==='raised')).not.toBe(oldStamps.get('raised'));
 const changedAssets=landscapeAssets.map(a=>a.id==='asset.models.environment.canopy-oak'?{...a,scenery:'changed-oak'}:a);
 expect(projectMapObjects(nextMap,next.generated!,changedAssets).stamps.find(s=>s.id==='raised')?.asset).toBe('changed-oak');
 const outside=object('outside',300,300),large={...before,size:512 as const,authoring:{...before.authoring!,objects:[outside]}};
 const small=projectMapObjects({...large,size:256},compiled.generated!,landscapeAssets);
 expect(small.resources.some(r=>r.id==='outside')).toBe(false);
 expect(small.stamps.some(s=>s.id==='outside')).toBe(true);
 expect(projectMapObjects(large,compiled.generated!,landscapeAssets).resources.some(r=>r.id==='outside')).toBe(true);
});

it('rechecks ordered resource-cell ownership even when per-object projections are cached',()=>{
 const before=fixture(),compiled=compileMapScene(before,landscapeAssets),a=object('a',100,100),b=object('b',100,100);
 const project=(objects:AuthoredObject[])=>projectMapObjects({...before,authoring:{...before.authoring!,objects}},compiled.generated!,landscapeAssets).resources.filter(r=>r.id==='a'||r.id==='b').map(r=>r.id);
 expect(project([a,b])).toEqual(['a']);expect(project([b,a])).toEqual(['b']);expect(project([a,b])).toEqual(['a']);
});

it('merges a cached generated tail with authored resources, preserving order, visibility and invalidation',()=>{
 const base=fixture(),compiled=compileMapScene(base,landscapeAssets);
 const generated={...compiled.generated!,objects:[
  {...object('generated-a',100,100),owner:'forest'},
  {...object('generated-b',100,100),owner:'forest'},
  {...object('generated-hidden',103,104),owner:'forest',visible:false},
  {...object('generated-outside',300,300),owner:'forest'},
  {...object('generated-raised',105,106,'absolute'),owner:'forest'},
 ]};
 const a=object('authored-a',100,100),b=object('authored-b',100,100);
 const compare=(map:typeof base,scene=generated,catalogue=landscapeAssets)=>{
  const actual=projectMapObjects(map,scene,catalogue);
  // Author-only projection is the exhaustive reference: it visits every record
  // in order and has no generated collection available to reuse.
  const reference=projectMapObjects({...map,authoring:{...map.authoring!,objects:[...map.authoring!.objects,...scene.objects]}},{...scene,objects:[]},catalogue);
  expect(actual).toEqual(reference);return actual;
 };
 let retained:Map<string,string>|undefined;
 for(const objects of [[a,b],[b,a],[{...a,x:101},b],[{...a,visible:false}],[]]){
  const result=compare({...base,authoring:{...base.authoring!,objects}});
  if(retained)expect(result.owners).toBe(retained);retained=result.owners;
 }
 compare({...base,size:512,authoring:{...base.authoring!,objects:[]}});
 compare(base,{...generated,objects:[...generated.objects].reverse()});
 compare(base,generated,landscapeAssets.map(asset=>asset.id==='asset.models.environment.canopy-oak'?{...asset,scenery:'alternate-oak'}:asset));
});
