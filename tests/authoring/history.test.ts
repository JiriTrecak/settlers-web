import {it,expect} from 'vitest';
import {AuthoringHistory} from '../../src/shared/authoring/history';
import {authoredObjectSchema,proceduralLayerSchema} from '../../src/shared/authoring/layers';
import {proceduralFixture} from './fixture';
import {compileMapScene} from '../../src/shared/authoring/mapScene';
import {landscapeAssets} from '../../src/shared/authoring/project';
it('applies a complete preview with exact undo and redo and no source ownership',()=>{
 const map=proceduralFixture(),h=new AuthoringHistory(map.authoring!),compiled=compileMapScene(map,landscapeAssets);
 const object=compiled.generated!.objects.find(o=>o.owner==='forest')!;
 h.selectGenerated(object.id,compiled.generated!);expect(h.selection).toEqual({kind:'layer',id:'forest'});
 const original=h.scene;h.apply(compiled);const applied=h.scene;
 expect(applied.layers).toHaveLength(0);expect(applied.objects.length).toBeGreaterThan(20);
 expect(applied.objects.every(o=>!('owner' in o)&&!('bakedFrom' in o))).toBe(true);
 h.undo();expect(h.scene).toEqual(original);expect(h.selection).toEqual({kind:'layer',id:'forest'});
 h.redo();expect(h.scene).toEqual(applied);h.undo();h.putLayer({...original.layers[0],name:'Changed'});expect(h.canRedo).toBe(false);
});
it('locks block accidental mutation but can be explicitly unlocked; snapshots cannot mutate history',()=>{
 const h=new AuthoringHistory({version:1,layers:[],objects:[]});const object={id:'bridge',asset:'wood',x:1,z:1,elevation:0,yaw:0,scale:1,heightMode:'terrain' as const,visible:true,locked:false};h.putObject(object);h.setLocked({kind:'object',id:object.id},true);
 expect(()=>h.putObject({...object,x:3})).toThrow('locked');expect(()=>h.remove({kind:'object',id:object.id})).toThrow('locked');const snapshot=h.scene;snapshot.objects[0]!.x=99;expect(h.scene.objects[0]!.x).toBe(1);
 h.setLocked({kind:'object',id:object.id},false);h.putObject({...object,x:3});expect(h.scene.objects[0]!.x).toBe(3);
});

it('edits records in place in both single and batch commands, with exact undo/redo',()=>{
 const objects=['a','b','c'].map((id,i)=>authoredObjectSchema.parse({id,asset:'pine',x:i,z:2}));
 const layers=['first','middle','last'].map(id=>proceduralLayerSchema.parse({id,name:id,recipe:'forest',seed:1,shape:{type:'region',points:[{x:0,z:0},{x:10,z:0},{x:5,z:10}]}}));
 const h=new AuthoringHistory({version:1,objects,layers}),original=h.scene;
 h.putObject({...objects[0],yaw:1});h.putLayer({...layers[0],name:'Renamed'});
 expect(h.scene.objects.map(o=>o.id)).toEqual(['a','b','c']);expect(h.scene.layers.map(l=>l.id)).toEqual(['first','middle','last']);
 const edited=h.scene;h.undo();h.undo();expect(h.scene).toEqual(original);h.redo();h.redo();expect(h.scene).toEqual(edited);
 h.undo();h.undo();h.batch([{action:'put-object',object:{...objects[0],yaw:1}},{action:'put-layer',layer:{...layers[0],name:'Renamed'}}]);expect(h.scene).toEqual(edited);
 h.undo();expect(h.scene).toEqual(original);h.redo();expect(h.scene).toEqual(edited);
 h.putObject({...objects[0],id:'new'});h.putLayer({...layers[0],id:'new-layer'});
 expect(h.scene.objects.map(o=>o.id)).toEqual(['a','b','c','new']);expect(h.scene.layers.map(l=>l.id)).toEqual(['first','middle','last','new-layer']);
 h.setLocked({kind:'object',id:'a'},true);const locked=h.scene;
 expect(()=>h.batch([{action:'put-object',object:{...objects[0],yaw:2}}])).toThrow('locked');expect(h.scene).toEqual(locked);
});
