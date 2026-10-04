import {coreEffects,presentationRecipes} from '../../src/content/effects/library';
import {visualEffectSchema} from '../../src/content/effects/schema';
import {it,expect,vi} from 'vitest';
import {AbilityEffects} from '../../src/render/abilities/abilityEffects';
import {castAnimation} from '../../src/render/abilities/castAnimation';
import {coreAbilities} from '../../src/content/abilities/core';
import {TextureLoader,Texture,PointLight,Sprite,Vector3,Quaternion} from 'three';
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
it('renders elevated deliveries and chain endpoints without replacing snapshots with current actor anchors',()=>{
 const loader=vi.spyOn(TextureLoader.prototype,'load').mockReturnValue(new Texture()),fx=new AbilityEffects();
 const p=coreAbilities.presentations.find(p=>p.id==='presentation.core.storm-bolt')!,r=presentationRecipes(p).find(r=>r.shape==='missile')!;
 try{
  fx.syncDeliveries([{cast:42,ability:'ability.core.storm-bolt',tick:20,position:{x:4,y:5,height:9},direction:{x:.6,y:0,height:.8}}],()=>p,()=>2);
  fx.update(20);expect(fx.root.children[0].children[0].position.y).toBeCloseTo(9+r.height);
  fx.clear();const chain=coreAbilities.presentations.find(p=>p.id==='presentation.core.chain-lightning')!;
  fx.consume({...event(43,'impact'),origin:{x:2,y:3,height:7},point:{x:8,y:3,height:12}},chain,()=>0,()=>({x:100,y:100,height:99}));fx.update(10);
  const root=fx.root.children[0],first=root.children[0],last=root.children.at(-1)!,offset=presentationRecipes(chain).find(r=>r.shape==='beam')!.height;
  const endpoint=(mesh:typeof first,sign:number)=>mesh.position.clone().add(new Vector3(0,sign*mesh.scale.y*.5,0).applyQuaternion(mesh.quaternion));
  expect(endpoint(first,-1).y).toBeCloseTo(7+offset);expect(endpoint(last,1).y).toBeCloseTo(12+offset);
 }finally{fx.dispose();loader.mockRestore();}
});
it('reconstructs a persistent buff after load and removes it immediately on dispel',()=>{
 const loader=vi.spyOn(TextureLoader.prototype,'load').mockReturnValue(new Texture()),fx=new AbilityEffects();
 const p=coreAbilities.presentations.find(p=>p.id==='presentation.core.bloodlust')!;
 const e={id:2,x:4,y:5,hp:100,spellStatuses:[{ability:'ability.core.bloodlust',status:'frenzy',cast:42,source:1,started:10,expires:2410,aura:false}]};
 try{
  fx.syncStatuses([e],500,()=>p);fx.update(500);expect(fx.liveCues).toBe(5);expect(fx.root.children.filter(c=>c.visible)).toHaveLength(1);
  // Hand flares remain hidden on incompatible actors, then resolve when the model loads.
  fx.update(501,undefined,undefined,()=>({position:new Vector3(4,2,5),rotation:new Quaternion()}));expect(fx.root.children.every(c=>c.visible)).toBe(true);
  fx.syncStatuses([{...e,spellStatuses:[]}],501,()=>p);expect(fx.liveCues).toBe(0);
 }finally{fx.dispose();loader.mockRestore();}
});
it('snapshots the target height for finite impacts while area events stay on the terrain',()=>{
 const loader=vi.spyOn(TextureLoader.prototype,'load').mockReturnValue(new Texture()),fx=new AbilityEffects();
 try{
  const p=coreAbilities.presentations.find(p=>p.id===coreAbilities.abilities.find(a=>a.id==='ability.core.holy-light')!.presentation)!;
  fx.consume(event(1,'healed'),p,()=>2,id=>id===2?{x:6,y:1,height:8}:undefined);
  expect(fx.root.children.length).toBeGreaterThan(0);expect(fx.root.children.every(c=>Math.abs(c.position.y-8.035)<.001)).toBe(true);
  fx.update(11,()=>({x:6,y:1,height:14}));
  const visual=fx.root.children.filter(c=>c.children.length>0),audio=fx.root.children.filter(c=>c.children.length===0);
  expect(visual.length).toBeGreaterThan(0);expect(visual.every(c=>Math.abs(c.position.y-8.035)<.001)).toBe(true);
  expect(audio.length).toBeGreaterThan(0);expect(audio.every(c=>Math.abs(c.position.y-14.035)<.001)).toBe(true);
  fx.clear();fx.consume({...event(2,'healed'),target:0},p,()=>2,id=>id===2?{x:6,y:1,height:8}:undefined);
  expect(fx.root.children.every(c=>Math.abs(c.position.y-2.035)<.001)).toBe(true);
 }finally{fx.dispose();loader.mockRestore();}
});

it('reconstructs long-lived seekers from delivery poses without launch history and removes them on cancellation',()=>{
 const effects=new AbilityEffects(),p=coreAbilities.presentations.find(p=>p.id==='presentation.core.spirit-swarm')!;
 try{
  effects.syncDeliveries([{cast:700,ability:'ability.core.spirit-swarm',tick:800,position:{x:120,y:120,height:6},direction:{x:1,y:0,height:0}}],()=>p);effects.update(801);expect(effects.liveCues).toBe(1);
  const root=effects.root.children[0],mesh=root.children[0];expect(mesh.position.x).toBe(120);expect(mesh.position.y).toBeCloseTo(6.9);
  effects.syncDeliveries([{cast:700,ability:'ability.core.spirit-swarm',tick:801,position:{x:119,y:120,height:5},direction:{x:-1,y:0,height:-1}}],()=>p);effects.update(802);expect(mesh.position.x).toBe(119);expect(mesh.position.y).toBeCloseTo(5.9);
  effects.update(5000);expect(effects.liveCues).toBe(1);effects.syncDeliveries([],()=>p);expect(effects.liveCues).toBe(0);
 }finally{effects.dispose();}
});

it('target inspection includes elevated glyph bounds and drops them after status cleanup',async()=>{
 const {visibleBounds}=await import('../../tooling/spell-editor/src/framing');
 const effect=visualEffectSchema.parse({schemaVersion:1,id:'effect.test.focus',name:'Focus',durationTicks:80,layers:[{id:'glyph',shape:'glow',colour:'#ffffff',accent:'#ffffff',durationTicks:80,count:1,size:2,height:12,follow:true,sustain:true}]});
 const p=presentationSchema.parse({schemaVersion:1,id:'presentation.test.focus',animations:{prepare:'idle',release:'idle',recover:'idle',fallback:'idle'},effects:[{id:'status',effect:effect.id,event:'statusApplied',anchor:'target',lifetime:'status',statusId:'ward'}]});
 const fx=new AbilityEffects(()=>[effect]),entity={id:2,x:4,y:5,hp:100,spellStatuses:[{ability:'ability.test.focus',status:'ward',cast:42,source:1,started:10,expires:90,aura:false}]};
 try{
  fx.syncStatuses([entity],50,()=>p);fx.update(50);const bounds=visibleBounds(fx.rootsForEntity(2));
  expect(bounds.min.y).toBeGreaterThan(12);expect(bounds.max.x-bounds.min.x).toBeCloseTo(4);expect(fx.rootsForEntity(1)).toEqual([]);
  fx.syncStatuses([{...entity,spellStatuses:[]}],51,()=>p);expect(visibleBounds(fx.rootsForEntity(2)).isEmpty()).toBe(true);
 }finally{fx.dispose();}
});
