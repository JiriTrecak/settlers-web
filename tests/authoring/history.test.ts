import {it,expect} from 'vitest';
import {AuthoringHistory} from '../../src/shared/authoring/history';
import {proceduralLayerSchema} from '../../src/shared/authoring/layers';
import type {GeneratedScene} from '../../src/shared/authoring/generate';
it('retains whole-layer bake through undo/redo and directs generated selection to its layer',()=>{
 const h=new AuthoringHistory({version:1,layers:[],objects:[]});
 const layer=proceduralLayerSchema.parse({id:'grove',name:'Grove',recipe:'forest',seed:1,shape:{type:'region',points:[{x:0,z:0},{x:10,z:0},{x:5,z:10}]}});h.putLayer(layer);
 const compiled:GeneratedScene={terrain:{originX:0,originZ:0,width:2,height:2,step:1,samples:new Float32Array(4)},rivers:[],paint:[],issues:[],scatterLayers:['grove'],objects:[{id:'tree-1',asset:'pine',x:1,z:1,elevation:0,yaw:0,scale:1,heightMode:'terrain',visible:true,locked:false,owner:'grove'}]};
 h.selectGenerated('tree-1',compiled);expect(h.selection).toEqual({kind:'layer',id:'grove'});
 const original=h.scene;h.bake('grove',compiled);expect(h.scene.layers).toHaveLength(0);expect(h.scene.objects).toHaveLength(1);
 h.undo();expect(h.scene).toEqual(original);expect(h.selection).toEqual({kind:'layer',id:'grove'});
 h.redo();expect(h.scene.objects[0]!.bakedFrom).toBe('grove');h.undo();h.putLayer({...layer,name:'Changed'});expect(h.canRedo).toBe(false);
});
it('locks block accidental mutation but can be explicitly unlocked; snapshots cannot mutate history',()=>{
 const h=new AuthoringHistory({version:1,layers:[],objects:[]});const object={id:'bridge',asset:'wood',x:1,z:1,elevation:0,yaw:0,scale:1,heightMode:'terrain' as const,visible:true,locked:false};h.putObject(object);h.setLocked({kind:'object',id:object.id},true);
 expect(()=>h.putObject({...object,x:3})).toThrow('locked');expect(()=>h.remove({kind:'object',id:object.id})).toThrow('locked');const snapshot=h.scene;snapshot.objects[0]!.x=99;expect(h.scene.objects[0]!.x).toBe(1);
 h.setLocked({kind:'object',id:object.id},false);h.putObject({...object,x:3});expect(h.scene.objects[0]!.x).toBe(3);
});
