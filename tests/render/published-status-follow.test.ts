import {expect,it} from 'vitest';
import {AbilityEffects} from '../../src/render/abilities/abilityEffects';
import {presentationSchema} from '../../src/content/abilities/schema';
import {visualEffectSchema} from '../../src/content/effects/schema';

const emitter={mode:'continuous',lifetimeTicks:30,rate:5,speed:.7,speedVariation:.2,direction:{x:0,y:1,z:0},coneDegrees:30,gravity:0,drag:1,spawnRadius:.6,startSize:.08,endSize:0,spin:0,fadeIn:.2,fadeOut:.6};
const layer=(id:string,over:Record<string,unknown>={})=>({id,anchor:'target',shape:'glow',colour:'#b497ee',accent:'#f0eaff',durationTicks:40,count:1,size:1,height:1,follow:true,...over});
/** Test-owned attached status visuals: a looping sustained ward and a one-shot mark, with offsets and a disabled layer. */
const effects=[
 visualEffectSchema.parse({schemaVersion:1,id:'effect.test.follow-ward',name:'Ward',durationTicks:80,loop:true,layers:[
  layer('glow',{sustain:true}),layer('motes',{sustain:true,shape:'particles',emitter,count:8,size:.1}),
  layer('offset',{sustain:true,offset:{x:1,y:.5,z:-2}}),layer('disabled',{sustain:true,enabled:false}),
 ]}),
 visualEffectSchema.parse({schemaVersion:1,id:'effect.test.follow-mark',name:'Mark',durationTicks:80,layers:[
  layer('brand',{height:.1,offset:{x:0,y:2,z:0}}),layer('embers',{shape:'particles',emitter,count:12,size:.08}),
 ]}),
];

it.each(effects.map(e=>[e.id,e] as const))('%s keeps every attached layer with its recipient and cleans up on status loss',(_id,effect)=>{
 const presentation=presentationSchema.parse({schemaVersion:1,id:'presentation.test.follow',animations:{prepare:'idle',release:'idle',recover:'idle',fallback:'idle'},effects:[{id:'attached',effect:effect.id,event:'statusApplied',anchor:'target',lifetime:'status',statusId:'mark'}]});
 const fx=new AbilityEffects(()=>[effect]);
 const actor={id:2,x:10,y:20,hp:100,spellStatuses:[{ability:'ability.test.follow',status:'mark',cast:1,source:1,started:0,expires:200,aura:false}]};
 const anchorHeight=3,anchor=(id:number)=>id===actor.id?{x:actor.x,y:actor.y,height:anchorHeight}:undefined;
 const enabled=effect.layers.filter(l=>l.enabled);
 try{
  fx.syncStatuses([actor],10,()=>presentation);fx.update(10,anchor);
  expect(fx.rootsForEntity(actor.id)).toHaveLength(enabled.length);
  actor.x=25;actor.y=35;fx.syncStatuses([actor],11,()=>presentation);fx.update(11,anchor);
  for(const [index,root] of fx.rootsForEntity(actor.id).entries()){
   const offset=enabled[index].offset;
   expect(root.position.x).toBeCloseTo(actor.x+(offset?.x??0));expect(root.position.z).toBeCloseTo(actor.y+(offset?.z??0));
   expect(root.position.y-(offset?.y??0)).toBeCloseTo(anchorHeight,1);
  }
  actor.spellStatuses=[];fx.syncStatuses([actor],12,()=>presentation);fx.update(12,anchor);expect(fx.liveCues).toBe(0);
 }finally{fx.dispose();}
});
