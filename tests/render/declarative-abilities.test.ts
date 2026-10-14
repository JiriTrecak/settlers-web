import {visualEffectSchema,type VisualEffect} from '../../src/content/effects/schema';
import {it,expect,vi} from 'vitest';
import {AbilityEffects} from '../../src/render/abilities/abilityEffects';
import {castAnimation} from '../../src/render/abilities/castAnimation';
import {TextureLoader,Texture,PointLight,Sprite,Vector3,Quaternion,Scene} from 'three';
import {effectLights} from '../../src/render/abilities/effectLights';
import {presentationSchema,type AbilityPresentation} from '../../src/content/abilities/schema';
import type {AbilityEvent} from '../../src/sim/abilities/runtime';

// Published resource lookup reads the shipped asset manifest; these tests own every effect, so resources are synthetic.
vi.mock('../../src/content/abilities/resources',async importOriginal=>({...await importOriginal<object>(),
 effectResource:(ref:{asset:string})=>({path:ref.asset+'.bin',bytes:100,sha256:'test'}),
 effectImage:(ref:{asset:string})=>({path:ref.asset+'.png',bytes:100,sha256:'test'})}));

const image=(asset:string)=>({asset,role:'image' as const,index:1});
const sound={asset:'asset.test.chime',role:'audio' as const,index:1,volume:.6,pitch:1,loop:false,fadeInTicks:1,fadeOutTicks:8,referenceDistance:12,maxDistance:70};
const effect=(id:string,durationTicks:number,layers:unknown[]):VisualEffect=>visualEffectSchema.parse({schemaVersion:1,id,name:id,durationTicks,loop:false,layers});
const presentation=(id:string,effects:unknown[],recover='idle'):AbilityPresentation=>presentationSchema.parse({schemaVersion:1,id,animations:{prepare:'attack',release:'attack',recover,fallback:'idle'},effects});
const event=(id:number,event:AbilityEvent['event']):AbilityEvent=>({id,cast:id,tick:10,ability:'ability.test.inline',caster:1,target:2,event,origin:{x:1,y:1},point:{x:6,y:1},viewers:['player.1']});

// Test-owned single-target spell: a caster ring while preparing, a lit sigil with rising strips on release, sparks on heal.
const prepare=effect('effect.test.inline-prepare',12,[{id:'gather',shape:'ring',colour:'#effc86',accent:'#ffffff',durationTicks:12,count:1,size:.7,height:.04}]);
const STRIPS=22;
const release=effect('effect.test.inline-release',48,[
 {id:'light',shape:'light',colour:'#f1ff64',accent:'#ffffff',durationTicks:42,count:1,size:7,height:3.8,follow:true,intensity:90},
 {id:'sigil',shape:'billboard',colour:'#f1ff64',accent:'#ffffff',durationTicks:48,count:1,size:2.6,height:5.25,follow:true,texture:image('asset.test.sigil')},
 {id:'strips',shape:'streaks',colour:'#f1ff64',accent:'#ffffff',durationTicks:44,count:STRIPS,size:.09,height:4.3,follow:true,spread:.9,length:1.8,texture:image('asset.test.spark')},
]);
const sparks=effect('effect.test.inline-sparks',24,[{id:'sparks',shape:'burst',colour:'#f1ff64',accent:'#ffffff',durationTicks:24,count:20,size:.4,height:1.5,spread:.8,texture:image('asset.test.spark')}]);
const spellEffects=[prepare,release,sparks];
const spell=presentation('presentation.test.inline-spell',[
 {id:'prepare',effect:prepare.id,event:'accepted',anchor:'caster',lifetime:'finite'},
 {id:'release',effect:release.id,event:'released',anchor:'target',lifetime:'finite'},
 {id:'heal',effect:sparks.id,event:'healed',anchor:'target',lifetime:'finite'},
],'attack');

it('caps particle allocation and clears expired/cancelled cues across repeated previews',()=>{
 const loader=vi.spyOn(TextureLoader.prototype,'load').mockReturnValue(new Texture());const effects=new AbilityEffects(()=>spellEffects);
 try{
  for(let round=0;round<10;round++){
   for(let i=1;i<=50;i++)effects.consume(event(i,'healed'),spell);
   expect(effects.root.children.reduce((n,c)=>n+c.children.length,0)).toBeLessThanOrEqual(512);
   effects.update(500);expect(effects.liveCues).toBe(0);expect(effects.root.children).toHaveLength(0);
   effects.consume(event(100,'accepted'),spell);expect(effects.liveCues).toBeGreaterThan(0);
   effects.consume(event(100,'cancelled'),spell);effects.update(10);expect(effects.liveCues).toBe(0);
  }
 }finally{effects.dispose();loader.mockRestore();}
});
it('uses declared clip phases and resolves missing clips through the explicit fallback',()=>{
 const t={startTick:10,releaseTick:22,finishTick:30};
 const before=castAnimation(spell,t,21,()=>true),at=castAnimation(spell,t,22,()=>true),after=castAnimation(spell,t,23,()=>true);
 expect(before.phase).toBeLessThan(at.phase);expect(at.phase).toBeCloseTo(.55);expect(after.phase).toBeGreaterThan(at.phase);
 expect(castAnimation(spell,t,12,c=>c==='idle').clip).toBe('idle');
});
it('renders the sigil and strips, follows the target, and releases pooled scene lights',()=>{
 const loader=vi.spyOn(TextureLoader.prototype,'load').mockReturnValue(new Texture());
 const error=vi.spyOn(console,'error');const effects=new AbilityEffects(()=>spellEffects);
 const scene=new Scene(),pool=effectLights(scene);scene.add(effects.root);
 try{
  effects.consume(event(1,'released'),spell);
  effects.update(16,id=>id===2?{x:20,y:30,height:4}:undefined);
  expect(effects.root.children.every(c=>c.position.x===20&&c.position.z===30&&c.position.y>=4&&c.position.y<4.1)).toBe(true);
  const sprites:Sprite[]=[],lights:PointLight[]=[];
  scene.traverse(o=>{if(o instanceof Sprite)sprites.push(o);if(o instanceof PointLight)lights.push(o);});
  expect(sprites.length).toBeGreaterThanOrEqual(STRIPS+1);
  expect(sprites.some(s=>s.scale.y>s.scale.x*10)).toBe(true);
  const pooled=lights.length;expect(pooled).toBeGreaterThan(0);expect(lights.filter(l=>l.intensity>0)).toHaveLength(1);expect(lights.every(l=>!l.castShadow)).toBe(true);
  const dispose=vi.spyOn(lights[0],'dispose');
  for(let i=2;i<20;i++)effects.consume(event(i,'released'),spell);
  effects.update(16);let count=0;scene.traverse(o=>{if(o instanceof PointLight)count++;});expect(count).toBe(pooled);
  effects.update(500);expect(effects.liveCues).toBe(0);expect(lights.every(l=>l.intensity===0)).toBe(true);expect(dispose).not.toHaveBeenCalled();expect(error).not.toHaveBeenCalled();
 }finally{effects.dispose();pool.dispose();loader.mockRestore();error.mockRestore();}
});
it('requires published texture references for sigils and strips',()=>{
 for(const shape of ['billboard','streaks']as const){
  const p=structuredClone(release);const cue=p.layers.find(c=>c.shape===shape)!;
  delete cue.texture;expect(visualEffectSchema.safeParse(p).success).toBe(false);
 }
});

// Test-owned area wave: angled falling shards with per-shard impacts, sized and timed by the authoritative wave event.
const rain={id:'shards',shape:'rain',colour:'#ffffff',accent:'#f0fcff',durationTicks:40,count:128,size:1.05,height:9,fallSpeed:2.6,launchDelayMs:50,fallAngleDegrees:30,fallAzimuthDegrees:-35,
 impact:{durationTicks:16,count:4,size:.25,spread:1.1,height:.85,colour:'#197dff',accent:'#74dfff'},spread:1,length:1.7,texture:image('asset.test.shard')} as const;
const wave=effect('effect.test.inline-wave',40,[rain]);
const area=presentation('presentation.test.inline-wave',[{id:'wave',effect:wave.id,event:'waveStarted',anchor:'target',lifetime:'finite',durationFrom:'delivery',spreadFrom:'radius'}]);

it('ties falling particles to authoritative wave duration and radius, then clears on interruption',()=>{
 const loader=vi.spyOn(TextureLoader.prototype,'load').mockReturnValue(new Texture()),effects=new AbilityEffects(()=>[wave]);
 try{
  effects.consume({...event(1,'waveStarted'),durationTicks:80,radius:8},area);
  const launch=10+80-80/rain.fallSpeed;
  effects.update(launch+5);const cue=effects.root.children[0],shard=cue.children[10] as Sprite,start=shard.position.y;
  expect(shard.position.y).toBeGreaterThan(0);
  effects.update(launch+10);expect(shard.position.y).toBeLessThan(start);expect(effects.liveCues).toBe(1);
  effects.consume(event(1,'cancelled'),area);expect(effects.liveCues).toBe(0);expect(effects.root.children).toHaveLength(0);
 }finally{effects.dispose();loader.mockRestore();}
});

it('staggers angled shards, lands within the disc on terrain, and explodes per shard without changing simulation events',()=>{
 const r=rain,loader=vi.spyOn(TextureLoader.prototype,'load').mockReturnValue(new Texture()),fx=new AbilityEffects(()=>[wave]);
 try{
  fx.consume({...event(9,'waveStarted'),durationTicks:40,radius:5},area,(x,z)=>x*.03+z*.07);
  const root=fx.root.children[0],shardCount=root.children.length/(r.impact.count+2),shards=root.children.slice(0,shardCount) as Sprite[];
  expect(Number.isInteger(shardCount)).toBe(true);expect(shardCount).toBeLessThanOrEqual(r.count);expect(root.children.length).toBeLessThanOrEqual(512);
  const flight=40/r.fallSpeed,launch=50-flight;
  fx.update(launch-.01);expect(shards.every(s=>!s.visible)).toBe(true);
  fx.update(launch+.8);const visible=shards.filter(s=>s.visible).length;
  expect(visible).toBeGreaterThan(0);expect(visible).toBeLessThan(shardCount);
  fx.update(launch+2.01);expect(shards.every(s=>s.visible)).toBe(true);
  fx.update(launch+5);const earlier=shards.map(s=>s.position.clone());
  fx.update(launch+10);shards.forEach((s,i)=>{const delta=s.position.clone().sub(earlier[i]);expect(-delta.y).toBeCloseTo(r.height*5/flight);expect(Math.hypot(delta.x,delta.z)/Math.abs(delta.y)).toBeCloseTo(Math.tan(r.fallAngleDegrees*Math.PI/180));});
  const positions=shards.map(s=>s.position.toArray());fx.update(launch+9);fx.update(launch+10);expect(shards.map(s=>s.position.toArray())).toEqual(positions);
  fx.update(50.8);expect(shards.some(s=>s.visible)).toBe(true);expect(shards.some(s=>!s.visible)).toBe(true);
  const impacts=root.children.slice(shardCount);expect(impacts.some(s=>s.visible)).toBe(true);
  fx.update(52.01);expect(shards.every(s=>!s.visible)).toBe(true);
  const perImpact=r.impact.count+1;
  for(let i=0;i<shardCount;i++){
   const flash=impacts[i*perImpact+r.impact.count];expect(flash.visible).toBe(true);
   expect(Math.hypot(flash.position.x,flash.position.z)).toBeLessThanOrEqual(5);
   const world=flash.position.clone().add(root.position);expect(world.y-(world.x*.03+world.z*.07)).toBeGreaterThanOrEqual(0);expect(world.y-(world.x*.03+world.z*.07)).toBeLessThan(.1);
  }
  // Overlapping impact tails and the next rain wave remain inside the shared allocation cap.
  fx.consume({...event(9,'waveStarted'),tick:50,durationTicks:40,radius:5},area);
  expect(fx.root.children.reduce((sum,c)=>sum+c.children.length,0)).toBeLessThanOrEqual(512);
  fx.consume(event(9,'cancelled'),area);expect(fx.liveCues).toBe(0);
 }finally{fx.dispose();loader.mockRestore();}
});

// Test-owned travelling spell: a textured missile for the delivery and a beam between impact endpoints.
const MISSILE_HEIGHT=1.6,BEAM_HEIGHT=1.6;
const missile=effect('effect.test.inline-missile',24,[{id:'bolt',shape:'missile',colour:'#ffffff',accent:'#ffffff',durationTicks:24,count:1,size:1.5,height:MISSILE_HEIGHT,texture:image('asset.test.bolt')}]);
const arc=effect('effect.test.inline-arc',10,[{id:'arc',shape:'beam',colour:'#74c6ff',accent:'#ffffff',durationTicks:10,count:12,size:.085,height:BEAM_HEIGHT}]);
const travelling=presentation('presentation.test.inline-bolt',[{id:'flight',effect:missile.id,event:'projectile',anchor:'target',lifetime:'finite',durationFrom:'delivery'}]);
const chain=presentation('presentation.test.inline-chain',[{id:'arc',effect:arc.id,event:'impact',anchor:'target',lifetime:'finite'}]);

it('reconstructs and clears travelling visuals from authoritative deliveries',()=>{
 const loader=vi.spyOn(TextureLoader.prototype,'load').mockReturnValue(new Texture()),fx=new AbilityEffects(()=>[missile]);
 try{
  fx.syncDeliveries([{cast:42,ability:'ability.test.inline-bolt',tick:20,position:{x:4,y:5},direction:{x:1,y:0}}],()=>travelling);
  fx.update(20);expect(fx.liveCues).toBe(1);expect(fx.root.children[0].children[0].position.x).toBe(4);
  fx.syncDeliveries([],()=>travelling);expect(fx.liveCues).toBe(0);
 }finally{fx.dispose();loader.mockRestore();}
});
it('renders elevated deliveries and chain endpoints without replacing snapshots with current actor anchors',()=>{
 const loader=vi.spyOn(TextureLoader.prototype,'load').mockReturnValue(new Texture()),fx=new AbilityEffects(()=>[missile,arc]);
 try{
  fx.syncDeliveries([{cast:42,ability:'ability.test.inline-bolt',tick:20,position:{x:4,y:5,height:9},direction:{x:.6,y:0,height:.8}}],()=>travelling,()=>2);
  fx.update(20);expect(fx.root.children[0].children[0].position.y).toBeCloseTo(9+MISSILE_HEIGHT);
  fx.clear();
  fx.consume({...event(43,'impact'),origin:{x:2,y:3,height:7},point:{x:8,y:3,height:12}},chain,()=>0,()=>({x:100,y:100,height:99}));fx.update(10);
  const root=fx.root.children[0],first=root.children[0],last=root.children.at(-1)!;
  const endpoint=(mesh:typeof first,sign:number)=>mesh.position.clone().add(new Vector3(0,sign*mesh.scale.y*.5,0).applyQuaternion(mesh.quaternion));
  expect(endpoint(first,-1).y).toBeCloseTo(7+BEAM_HEIGHT);expect(endpoint(last,1).y).toBeCloseTo(12+BEAM_HEIGHT);
 }finally{fx.dispose();loader.mockRestore();}
});

it('reconstructs a persistent buff after load, resolves socket-attached layers when the model loads, and removes it on dispel',()=>{
 const loader=vi.spyOn(TextureLoader.prototype,'load').mockReturnValue(new Texture());
 const pulse=effect('effect.test.inline-buff',24,[{id:'strips',shape:'streaks',colour:'#ee4b33',accent:'#ffffff',durationTicks:24,count:6,size:.12,height:2.4,follow:true,spread:.5,length:.65,texture:image('asset.test.spark')}]);
 const hands=visualEffectSchema.parse({schemaVersion:1,id:'effect.test.inline-hands',name:'Hands',durationTicks:80,loop:true,layers:['left','right'].map(side=>({id:side+'-flare',sustain:true,anchor:'target',shape:'billboard',attachment:{socket:side+'-hand',fallback:'hide',inheritRotation:false},colour:'#ff7945',accent:'#ffd295',durationTicks:80,count:1,size:1,height:0,follow:true,texture:image('asset.test.spark')}))});
 const p=presentation('presentation.test.inline-buff',[
  {id:'pulse',effect:pulse.id,event:'statusApplied',anchor:'target',lifetime:'finite',durationFrom:'delivery'},
  {id:'hands',effect:hands.id,statusId:'frenzy',event:'statusApplied',anchor:'target',lifetime:'status'},
 ]);
 const fx=new AbilityEffects(()=>[pulse,hands]);
 const e={id:2,x:4,y:5,hp:100,spellStatuses:[{ability:'ability.test.inline-buff',status:'frenzy',cast:42,source:1,started:10,expires:2410,aura:false}]};
 try{
  fx.syncStatuses([e],500,()=>p);fx.update(500);expect(fx.liveCues).toBe(pulse.layers.length+hands.layers.length);expect(fx.root.children.filter(c=>c.visible)).toHaveLength(pulse.layers.length);
  // Hand layers stay hidden on actors without the sockets, then resolve when the model provides them.
  fx.update(501,undefined,undefined,()=>({position:new Vector3(4,2,5),rotation:new Quaternion()}));expect(fx.root.children.every(c=>c.visible)).toBe(true);
  fx.syncStatuses([{...e,spellStatuses:[]}],501,()=>p);expect(fx.liveCues).toBe(0);
 }finally{fx.dispose();loader.mockRestore();}
});
it('snapshots the target height for finite impacts while sound follows the actor and area events stay on the terrain',()=>{
 const loader=vi.spyOn(TextureLoader.prototype,'load').mockReturnValue(new Texture());
 const burst=effect('effect.test.inline-heal',160,[
  {id:'burst',shape:'particles',colour:'#ffd969',accent:'#fff4ce',durationTicks:28,count:30,size:.12,height:1.3,emitter:{mode:'burst',lifetimeTicks:28,rate:5,speed:3,speedVariation:.6,direction:{x:0,y:1,z:0},coneDegrees:120,gravity:0,drag:2,spawnRadius:.35,startSize:.18,endSize:0,spin:0,fadeIn:.05,fadeOut:.6}},
  {id:'sound',shape:'sound',sound,colour:'#ffffff',accent:'#ffffff',durationTicks:160,count:1,size:1,height:0,follow:true},
 ]);
 const p=presentation('presentation.test.inline-heal',[{id:'heal',effect:burst.id,event:'healed',anchor:'target',lifetime:'finite'}]),fx=new AbilityEffects(()=>[burst]);
 const lifted=(y:number,ground:number)=>y>=ground&&y<ground+.1;
 try{
  fx.consume(event(1,'healed'),p,()=>2,id=>id===2?{x:6,y:1,height:8}:undefined);
  expect(fx.root.children.length).toBeGreaterThan(0);expect(fx.root.children.every(c=>lifted(c.position.y,8))).toBe(true);
  fx.update(11,()=>({x:6,y:1,height:14}));
  const visual=fx.root.children.filter(c=>c.children.length>0),audio=fx.root.children.filter(c=>c.children.length===0);
  expect(visual.length).toBeGreaterThan(0);expect(visual.every(c=>lifted(c.position.y,8))).toBe(true);
  expect(audio.length).toBeGreaterThan(0);expect(audio.every(c=>lifted(c.position.y,14))).toBe(true);
  fx.clear();fx.consume({...event(2,'healed'),target:0},p,()=>2,id=>id===2?{x:6,y:1,height:8}:undefined);
  expect(fx.root.children.every(c=>lifted(c.position.y,2))).toBe(true);
 }finally{fx.dispose();loader.mockRestore();}
});

it('reconstructs long-lived seekers from delivery poses without launch history and removes them on cancellation',()=>{
 const SEEKER_HEIGHT=.9;
 const seeker=effect('effect.test.inline-seeker',200,[{id:'seeker',shape:'missile',colour:'#9be875',accent:'#ebffc2',durationTicks:200,count:1,size:.3,height:SEEKER_HEIGHT,trail:{durationTicks:12,maxPoints:24,width:.16,colour:'#d5e99a',opacity:.65,breakDistance:2.5}}]);
 const p=presentation('presentation.test.inline-seeker',[{id:'flight',effect:seeker.id,event:'projectile',anchor:'target',lifetime:'finite',durationFrom:'delivery'}]);
 const effects=new AbilityEffects(()=>[seeker]);
 try{
  effects.syncDeliveries([{cast:700,ability:'ability.test.inline-seeker',tick:800,position:{x:120,y:120,height:6},direction:{x:1,y:0,height:0}}],()=>p);effects.update(801);expect(effects.liveCues).toBe(1);
  const root=effects.root.children[0],mesh=root.children[0];expect(mesh.position.x).toBe(120);expect(mesh.position.y).toBeCloseTo(6+SEEKER_HEIGHT);
  effects.syncDeliveries([{cast:700,ability:'ability.test.inline-seeker',tick:801,position:{x:119,y:120,height:5},direction:{x:-1,y:0,height:-1}}],()=>p);effects.update(802);expect(mesh.position.x).toBe(119);expect(mesh.position.y).toBeCloseTo(5+SEEKER_HEIGHT);
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
