import {it,expect} from 'vitest';
import {EffectPlayer} from '../../src/render/abilities/effectPlayer';
import {visualEffectSchema,resolveEffectBindings} from '../../src/content/effects/schema';
import {Mesh} from 'three';
const make=()=>visualEffectSchema.parse({schemaVersion:1,id:'effect.test.sparks',name:'Sparks',durationTicks:80,loop:false,layers:[{id:'sparks',startTick:10,anchor:'source',shape:'particles',colour:'#ffa550',accent:'#ff3311',durationTicks:80,count:32,size:.1,height:1,emitter:{mode:'continuous',lifetimeTicks:20,rate:80,speed:3,speedVariation:.4,direction:{x:0,y:1,z:0},coneDegrees:45,gravity:-2,drag:.2,spawnRadius:.3,startSize:.2,endSize:0,spin:1,fadeIn:.1,fadeOut:.4}}]});
it('plays visual definitions without a simulation, respecting delays, endpoints, seed, lifetime and stop',()=>{
 const fx=new EffectPlayer(),fresh=new EffectPlayer(),effect=make();
 const options={seed:82,source:{x:3,y:4},target:{x:9,y:8}};
 try{
  fx.play(effect,options);fx.update(5);expect(fx.root.children[0].visible).toBe(false);
  fx.update(25);expect(fx.root.children[0].position.x).toBe(3);expect(fx.root.children[0].position.z).toBe(4);
  const snapshot=()=>fx.root.children[0].children.map(p=>[p.visible,p.position.toArray(),p.scale.toArray(),(p as Mesh<any,any>).material.opacity]);const before=snapshot();
  fx.update(29);fx.update(25);expect(snapshot()).toEqual(before);
  fresh.play(effect,options);fresh.update(25);expect(fresh.root.children[0].children.map(p=>p.position.toArray())).toEqual(fx.root.children[0].children.map(p=>p.position.toArray()));
  fx.update(200);expect(fx.liveCues).toBe(0);
  const handle=fx.play(effect,options);fx.update(25);fx.stop(handle);expect(fx.liveCues).toBe(0);
 }finally{fx.dispose();fresh.dispose();}
});
it('loops without leaking, remains bounded under overlapping instances, and rejects unknown links',()=>{
 const fx=new EffectPlayer(),effect=make();effect.loop=true;
 try{for(let i=0;i<100;i++)fx.play(effect,{seed:i});for(const t of [15,80,160,240,9000])fx.update(t);expect(fx.root.children.reduce((n,r)=>n+r.children.length,0)).toBeLessThanOrEqual(512);fx.clear();expect(fx.liveCues).toBe(0);}finally{fx.dispose();}
 expect(()=>resolveEffectBindings([{id:'link',effect:'effect.missing',event:'released',anchor:'target',lifetime:'finite'}],[effect])).toThrow('Unknown visual effect');
 const bad=make();delete bad.layers[0].emitter;expect(visualEffectSchema.safeParse(bad).success).toBe(false);
});

it('gives overlapping instances independent stop handles even with the same visual seed',()=>{
 const fx=new EffectPlayer();try{const first=fx.play(make(),{seed:7}),second=fx.play(make(),{seed:7});expect(first).not.toBe(second);expect(fx.liveCues).toBe(2);fx.stop(first);expect(fx.liveCues).toBe(1);fx.stop(second);expect(fx.liveCues).toBe(0);}finally{fx.dispose();}
});

it('sustains continuous emission until explicitly stopped',()=>{
 const fx=new EffectPlayer(),effect=make();effect.layers[0].sustain=true;try{const handle=fx.play(effect,{seed:1});fx.update(4000);expect(fx.liveCues).toBe(1);expect(fx.root.children[0].children.some(p=>p.visible)).toBe(true);fx.stop(handle);expect(fx.liveCues).toBe(0);}finally{fx.dispose();}
});
