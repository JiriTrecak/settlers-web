import {expect,it} from 'vitest';
import {Vector3} from 'three';
import {EffectPlayer,type EffectAnchor} from '../../src/render/abilities/effectPlayer';
import {visualEffectSchema} from '../../src/content/effects/schema';

const effect=(follow:boolean)=>visualEffectSchema.parse({schemaVersion:1,id:'effect.test.link',name:'Link',durationTicks:80,loop:false,layers:[{id:'beam',shape:'beam',anchor:'target',follow,colour:'#8844cc',accent:'#fff5db',durationTicks:80,count:8,size:.08,height:1.2}]});
function endpoints(fx:EffectPlayer){
 const root=fx.root.children[0],first=root.children[0],last=root.children.at(-1)!;
 root.updateMatrixWorld(true);
 return [first.localToWorld(new Vector3(0,-.5,0)),last.localToWorld(new Vector3(0,.5,0))].map(v=>v.toArray().map(n=>Math.round(n*1e6)/1e6));
}
it('tracks both beam actors, including height, independently of its target anchor and without seek drift',()=>{
 const fx=new EffectPlayer();try{
  fx.play(effect(true),{source:{x:1,y:2,height:3},target:{x:5,y:6,height:7}});
  const anchor:EffectAnchor=id=>id===0?{x:11,y:12,height:13}:{x:15,y:16,height:17};
  fx.update(20,anchor);expect(endpoints(fx)).toEqual([[11,14.2,12],[15,18.2,16]]);
  fx.update(30,id=>id===0?{x:21,y:22,height:23}:{x:25,y:26,height:27});
  expect(endpoints(fx)).toEqual([[21,24.2,22],[25,28.2,26]]);
  fx.update(20,anchor);expect(endpoints(fx)).toEqual([[11,14.2,12],[15,18.2,16]]);
  fx.update(80,anchor);expect(fx.liveCues).toBe(0);
 }finally{fx.dispose();}
});
it('preserves fixed beam points even when actors move',()=>{
 const fx=new EffectPlayer();try{
  fx.play(effect(false),{source:{x:1,y:2,height:3},target:{x:5,y:6,height:7}});
  fx.update(20,()=>({x:100,y:100,height:100}));expect(endpoints(fx)).toEqual([[1,4.2,2],[5,8.2,6]]);
 }finally{fx.dispose();}
});
it('falls back per missing endpoint to the captured point, without mutating its fallback on prior frames',()=>{
 const fx=new EffectPlayer();try{
  fx.play(effect(true),{source:{x:1,y:2,height:3},target:{x:5,y:6,height:7}});
  fx.update(10,()=>({x:100,y:100,height:100}));
  fx.update(20,id=>id===0?{x:11,y:12,height:13}:undefined);expect(endpoints(fx)).toEqual([[11,14.2,12],[5,8.2,6]]);
  fx.update(21,()=>undefined);expect(endpoints(fx)).toEqual([[1,4.2,2],[5,8.2,6]]);
 }finally{fx.dispose();}
});
