import {describe,it,expect} from 'vitest';
import {cleanupPreview,cleanupRequestSchema,areaContains} from '../../src/shared/authoring/cleanup';
import {AuthoringHistory} from '../../src/shared/authoring/history';
import {authoringSceneSchema} from '../../src/shared/authoring/layers';
import type {LandscapeAsset} from '../../src/shared/authoring/catalogue';
const assets:LandscapeAsset[]=[{id:'tree.oak',name:'Oak',kind:'tree',scale:1,clearance:1},{id:'rock',name:'Rock',kind:'prop',scale:1,clearance:1}];
const scene=()=>authoringSceneSchema.parse({version:1,layers:[],objects:[...Array.from({length:1000},(_,i)=>({id:'tree.'+i,asset:'tree.oak',x:i%50,z:Math.floor(i/50),locked:i===5})),{id:'boulder',asset:'rock',x:5,z:5}]});
describe('area cleanup',()=>{
 it('previews exact counts, protects locks and deletes a thousand-object region in one undo step',()=>{
  const initial=scene(),history=new AuthoringHistory(initial),request=cleanupRequestSchema.parse({area:{type:'rectangle',from:{x:0,z:0},to:{x:50,z:20}},kinds:['tree']});
  const preview=cleanupPreview(initial,request,assets);expect(preview.count).toBe(999);expect(preview.lockedCount).toBe(1);
  history.cleanup(request,assets);expect(history.scene.objects.map(o=>o.id)).toEqual(['tree.5','boulder']);
  history.undo();expect(history.scene).toEqual(initial);history.redo();expect(history.scene.objects).toHaveLength(2);
 });
 it('sweeps long brush segments without leaving gaps and supports concave lasso shapes',()=>{
  expect(areaContains({type:'brush',radius:1,points:[{x:0,z:0},{x:100,z:0}]},50,.5)).toBe(true);
  const lasso={type:'lasso' as const,points:[{x:0,z:0},{x:10,z:0},{x:10,z:3},{x:3,z:3},{x:3,z:10},{x:0,z:10}]};
  expect(areaContains(lasso,2,8)).toBe(true);expect(areaContains(lasso,8,8)).toBe(false);
 });
 it('honours asset filters and does not create an undo entry when no objects match',()=>{
  const history=new AuthoringHistory(scene()),request=cleanupRequestSchema.parse({area:{type:'brush',radius:20,points:[{x:10,z:10}]},assets:['missing']});
  history.cleanup(request,assets);expect(history.canUndo).toBe(false);
 });
});

it('cleans applied instances, placed stamps and decals atomically while retaining locked decorations',()=>{
 const history=new AuthoringHistory(scene());
 history.decorations={stamps:[{id:'placed',asset:'oak',x:4,y:4},{id:'protected',asset:'oak',x:5,y:4,locked:true}],decals:[{id:'litter',kind:'leaf-litter',x:4,z:4,size:2,rotation:0,opacity:1},{id:'keep',kind:'pebbles',x:4,z:4,size:2,rotation:0,opacity:1,locked:true}]};
 const initial=structuredClone(history.decorations),catalogue=assets.map(a=>({...a,scenery:a.kind==='tree'?'oak':'rock'}));
 const request=cleanupRequestSchema.parse({area:{type:'rectangle',from:{x:0,z:0},to:{x:50,z:20}},kinds:['tree','decal']});
 const preview=cleanupPreview(history.scene,request,catalogue,history.decorations);
 expect(preview.count).toBe(1001);expect(preview.lockedCount).toBe(3);
 history.cleanup(request,catalogue);expect(history.decorations.stamps.map(s=>s.id)).toEqual(['protected']);expect(history.decorations.decals.map(s=>s.id)).toEqual(['keep']);
 history.undo();expect(history.decorations).toEqual(initial);expect(history.scene.objects).toHaveLength(1001);
 history.redo();expect(history.decorations.decals).toHaveLength(1);
});
