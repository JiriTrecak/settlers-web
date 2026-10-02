import {coreEffects,presentationRecipes} from '../../src/content/effects/library';
import {visualEffectSchema} from '../../src/content/effects/schema';
import {it,expect,vi} from 'vitest';
import {AbilityEffects} from '../../src/render/abilities/abilityEffects';
import {castAnimation} from '../../src/render/abilities/castAnimation';
import {coreAbilities} from '../../src/content/abilities/core';
import {TextureLoader,Texture,PointLight,Sprite} from 'three';
import {presentationSchema} from '../../src/content/abilities/schema';
import type {AbilityEvent} from '../../src/sim/abilities/runtime';
const event=(id:number,event:AbilityEvent['event']):AbilityEvent=>({id,cast:id,tick:10,ability:coreAbilities.abilities[0].id,caster:1,target:2,event,origin:{x:1,y:1},point:{x:6,y:1},viewers:['player.1']});
it('caps particle allocation and clears expired/cancelled cues across repeated previews',()=>{
 const loader=vi.spyOn(TextureLoader.prototype,'load').mockReturnValue(new Texture());const effects=new AbilityEffects();
 try{
  for(let round=0;round<10;round++){
   for(let i=1;i<=50;i++)effects.consume(event(i,'healed'),coreAbilities.presentations[0]);
   expect(effects.root.children.reduce((n,c)=>n+c.children.length,0)).toBeLessThanOrEqual(512);
   effects.update(500);expect(effects.liveCues).toBe(0);expect(effects.root.children).toHaveLength(0);
   effects.consume(event(100,'accepted'),coreAbilities.presentations[0]);effects.consume(event(100,'cancelled'),coreAbilities.presentations[0]);effects.update(10);expect(effects.liveCues).toBe(0);
  }
 }finally{effects.dispose();loader.mockRestore();}
});
it('uses declared clip phases and resolves missing clips through the explicit fallback',()=>{
 const p=coreAbilities.presentations[0],t={startTick:10,releaseTick:22,finishTick:30};
 const before=castAnimation(p,t,21,()=>true),at=castAnimation(p,t,22,()=>true),after=castAnimation(p,t,23,()=>true);
 expect(before.phase).toBeLessThan(at.phase);expect(at.phase).toBeCloseTo(.55);expect(after.phase).toBeGreaterThan(at.phase);
 expect(castAnimation(p,t,12,c=>c==='idle').clip).toBe('idle');
});
it('renders the sigil and strips, follows the target, and bounds and disposes real lights',()=>{
 const loader=vi.spyOn(TextureLoader.prototype,'load').mockReturnValue(new Texture());
 const error=vi.spyOn(console,'error');const effects=new AbilityEffects();
 try{
  effects.consume(event(1,'released'),coreAbilities.presentations[0]);
  effects.update(16,id=>id===2?{x:20,y:30,height:4}:undefined);
  expect(effects.root.children.every(c=>c.position.x===20&&c.position.z===30&&Math.abs(c.position.y-4.035)<.0001)).toBe(true);
  const sprites:Sprite[]=[],lights:PointLight[]=[];
  effects.root.traverse(o=>{if(o instanceof Sprite)sprites.push(o);if(o instanceof PointLight)lights.push(o);});
  expect(sprites.length).toBeGreaterThan(20);
  expect(sprites.some(s=>s.scale.y>s.scale.x*10)).toBe(true);
  expect(lights).toHaveLength(1);expect(lights[0].intensity).toBeGreaterThan(0);expect(lights[0].castShadow).toBe(false);
  const dispose=vi.spyOn(lights[0],'dispose');
  for(let i=2;i<20;i++)effects.consume(event(i,'released'),coreAbilities.presentations[0]);
  let count=0;effects.root.traverse(o=>{if(o instanceof PointLight)count++;});expect(count).toBe(4);
  effects.update(500);expect(effects.liveCues).toBe(0);expect(dispose).toHaveBeenCalledOnce();expect(error).not.toHaveBeenCalled();
 }finally{effects.dispose();loader.mockRestore();error.mockRestore();}
});
it('requires published texture references for sigils and strips',()=>{
 for(const shape of ['billboard','streaks']as const){
  const p=structuredClone(coreEffects.find(e=>e.layers.some(c=>c.shape===shape))!);const cue=p.layers.find(c=>c.shape===shape)!;
  delete cue.texture;expect(visualEffectSchema.safeParse(p).success).toBe(false);
 }
});

it('ties falling particles to authoritative wave duration and radius, then clears on interruption',async()=>{
 const {default:raw}=await import('../../content/abilities/ability.core.blizzard/presentation.json');
 const p=presentationSchema.parse(raw),loader=vi.spyOn(TextureLoader.prototype,'load').mockReturnValue(new Texture());
 const effects=new AbilityEffects();
 try{
  effects.consume({...event(1,'waveStarted'),durationTicks:80,radius:8},p);
  const launch=10+80-80/(presentationRecipes(p).find(c=>c.shape==='rain')!.fallSpeed??1);
  effects.update(launch+5);const cue=effects.root.children[0],shard=cue.children[10] as Sprite,start=shard.position.y;
  expect(shard.position.y).toBeGreaterThan(0);
  effects.update(launch+10);expect(shard.position.y).toBeLessThan(start);expect(effects.liveCues).toBe(1);
  effects.consume(event(1,'cancelled'),p);expect(effects.liveCues).toBe(0);expect(effects.root.children).toHaveLength(0);
 }finally{effects.dispose();loader.mockRestore();}
});

it('staggers angled shards, lands within the disc on terrain, and explodes per shard without changing simulation events',async()=>{
 const {default:raw}=await import('../../content/abilities/ability.core.blizzard/presentation.json');
 const p=presentationSchema.parse(raw),r=presentationRecipes(p).find(c=>c.shape==='rain')!;
 const loader=vi.spyOn(TextureLoader.prototype,'load').mockReturnValue(new Texture()),fx=new AbilityEffects();
 try{
  expect(presentationRecipes(p).some(c=>c.shape==='ring')).toBe(false);
  fx.consume({...event(9,'waveStarted'),durationTicks:40,radius:5},p,(x,z)=>x*.03+z*.07);
  const root=fx.root.children[0],shardCount=root.children.length/(r.impact!.count+2),shards=root.children.slice(0,shardCount) as Sprite[];
  expect(Number.isInteger(shardCount)).toBe(true);expect(shardCount).toBeLessThanOrEqual(r.count);expect(root.children.length).toBeLessThanOrEqual(512);
  const flight=40/(r.fallSpeed??1),launch=50-flight;
  fx.update(launch-.01);expect(shards.every(s=>!s.visible)).toBe(true);
  fx.update(launch+.8);const visible=shards.filter(s=>s.visible).length;
  expect(visible).toBeGreaterThan(0);expect(visible).toBeLessThan(shardCount);
  fx.update(launch+2.01);expect(shards.every(s=>s.visible)).toBe(true);
  fx.update(launch+5);const earlier=shards.map(s=>s.position.clone());
  fx.update(launch+10);shards.forEach((s,i)=>{const delta=s.position.clone().sub(earlier[i]);expect(-delta.y).toBeCloseTo(r.height*5/flight);expect(Math.hypot(delta.x,delta.z)/Math.abs(delta.y)).toBeCloseTo(Math.tan(Math.PI/6));});
  const positions=shards.map(s=>s.position.toArray());fx.update(launch+9);fx.update(launch+10);expect(shards.map(s=>s.position.toArray())).toEqual(positions);
  fx.update(50.8);expect(shards.some(s=>s.visible)).toBe(true);expect(shards.some(s=>!s.visible)).toBe(true);
  const impacts=root.children.slice(shardCount);expect(impacts.some(s=>s.visible)).toBe(true);
  fx.update(52.01);expect(shards.every(s=>!s.visible)).toBe(true);
  const perImpact=r.impact!.count+1;
  for(let i=0;i<shardCount;i++){
   const flash=impacts[i*perImpact+r.impact!.count];expect(flash.visible).toBe(true);
   expect(Math.hypot(flash.position.x,flash.position.z)).toBeLessThanOrEqual(5);
   const world=flash.position.clone().add(root.position);expect(world.y).toBeCloseTo(world.x*.03+world.z*.07+.055);
  }
  // Overlapping impact tails and the next rain wave remain inside the shared allocation cap.
  fx.consume({...event(9,'waveStarted'),tick:50,durationTicks:40,radius:5},p);
  expect(fx.root.children.reduce((sum,c)=>sum+c.children.length,0)).toBeLessThanOrEqual(512);
  fx.consume(event(9,'cancelled'),p);expect(fx.liveCues).toBe(0);
 }finally{fx.dispose();loader.mockRestore();}
});

it('reconstructs and clears travelling visuals from authoritative deliveries',()=>{
 const loader=vi.spyOn(TextureLoader.prototype,'load').mockReturnValue(new Texture()),fx=new AbilityEffects();
 const p=coreAbilities.presentations.find(p=>p.id==='presentation.core.storm-bolt')!;
 try{
  fx.syncDeliveries([{cast:42,ability:'ability.core.storm-bolt',tick:20,position:{x:4,y:5},direction:{x:1,y:0}}],()=>p);
  fx.update(20);expect(fx.liveCues).toBe(1);expect(fx.root.children[0].children[0].position.x).toBe(4);
  fx.syncDeliveries([],()=>p);expect(fx.liveCues).toBe(0);
 }finally{fx.dispose();loader.mockRestore();}
});
it('reconstructs a persistent buff after load and removes it immediately on dispel',()=>{
 const loader=vi.spyOn(TextureLoader.prototype,'load').mockReturnValue(new Texture()),fx=new AbilityEffects();
 const p=coreAbilities.presentations.find(p=>p.id==='presentation.core.bloodlust')!;
 const e={id:2,x:4,y:5,hp:100,spellStatuses:[{ability:'ability.core.bloodlust',cast:42,source:1,started:10,expires:2410,aura:false}]};
 try{
  fx.syncStatuses([e],500,()=>p);fx.update(500);expect(fx.liveCues).toBe(1);
  fx.syncStatuses([{...e,spellStatuses:[]}],501,()=>p);expect(fx.liveCues).toBe(0);
 }finally{fx.dispose();loader.mockRestore();}
});
