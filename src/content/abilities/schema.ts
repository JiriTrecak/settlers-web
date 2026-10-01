import {z} from 'zod';
import {itemModifiersSchema} from '../items';

export const ABILITY_ABI = 'abilities-1';
export const abilityId = z.string().regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/).max(160);
const uint = z.number().int().min(0).max(1_000_000);
const ticks = uint.max(144_000);
const parameter = z.string().regex(/^[a-z][a-zA-Z0-9]*$/).max(48);
export const amountSchema = z.union([uint, z.object({rankParameter: parameter}).strict()]);
const heal = z.object({op:z.literal('heal'), target:z.literal('target'), amount:amountSchema}).strict();
const damage = z.object({op:z.literal('damage'), target:z.literal('target'), amount:amountSchema, damageType:z.string().min(1).max(80)}).strict();
export const statusEffectSchema=z.object({op:z.literal('status'),target:z.literal('target'),id:parameter,
 amount:amountSchema,heroDuration:amountSchema.optional(),polarity:z.enum(['positive','negative']),dispel:z.boolean(),
 modifiers:itemModifiersSchema.default({}),stun:z.boolean().optional(),disarm:z.boolean().optional(),
 periodic:z.object({intervalTicks:ticks.min(1),damage:amountSchema,damageType:z.string().min(1)}).strict().optional(),
}).strict();
const dispel=z.object({op:z.literal('dispel'),target:z.literal('target'),amount:amountSchema,damageType:z.string().min(1),polarity:z.enum(['all','positive','negative'])}).strict();
const summon=z.object({op:z.literal('summon'),target:z.literal('target'),amount:amountSchema,definition:abilityId,durationTicks:ticks.min(1),replace:z.boolean(),radius:z.number().min(1).max(12)}).strict();
export const effectSchema = z.discriminatedUnion('op',[heal,damage,statusEffectSchema,dispel,summon]);
export type StatusEffect=z.infer<typeof statusEffectSchema>;
export const deliverySchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('projectile'),speed:z.number().min(1).max(100)}).strict(),
 z.object({kind:z.literal('chain'),bounces:amountSchema,radius:z.number().min(1).max(20),intervalTicks:ticks.min(1).max(80),retentionPermille:z.number().int().min(1).max(1000)}).strict(),
 z.object({kind:z.literal('line'),speed:z.number().min(1).max(100),length:z.number().min(1).max(64),width:z.number().min(.1).max(10)}).strict(),
]);
const program = z.array(effectSchema).min(1).max(8);
export const operationSchema = z.union([effectSchema,z.object({
 op:z.literal('branch'),
 condition:z.object({kind:z.literal('relation'),of:z.literal('target'),to:z.literal('caster'),is:z.enum(['ally','enemy'])}).strict(),
 then:program,else:program,
}).strict()]);
export const abilitySchema = z.object({
 schemaVersion:z.literal(1), id:abilityId, name:z.string().trim().min(1).max(100), description:z.string().max(2000).default(''),
 activation:z.enum(['targeted','passive']),
 delivery:deliverySchema.optional(),
 aura:z.object({radius:z.number().min(1).max(32),meleeOnly:z.boolean()}).strict().optional(),
 autocast:z.object({intervalTicks:ticks.min(1).max(400),enabledByDefault:z.boolean()}).strict().optional(),
 ranks:z.array(z.record(parameter,uint)).min(1).max(10),
 targeting:z.object({includeBuildings:z.boolean().optional(),kind:z.enum(['unit','point','self']),radius:amountSchema.optional(),maxTargets:z.number().int().min(1).max(128).optional(),alive:z.literal(true),visible:z.literal(true),relations:z.array(z.enum(['ally','enemy'])).min(1).max(2).refine(a=>new Set(a).size===a.length,'Duplicate relationship'),allowSelf:z.boolean(),range:amountSchema,outOfRange:z.literal('reject')}).strict(),
 cast:z.object({prepareTicks:ticks,recoverTicks:ticks,
  channel:z.object({waves:amountSchema,intervalTicks:amountSchema}).strict().optional(),
  cost:z.object({resource:z.literal('mana'),amount:amountSchema,commit:z.literal('release')}).strict(),
  cooldown:z.object({ticks:amountSchema,start:z.literal('release'),scope:z.literal('ability')}).strict(),
  cancelBeforeRelease:z.literal('refund'),
  revalidateAtRelease:z.tuple([z.literal('caster'),z.literal('target'),z.literal('range'),z.literal('visibility'),z.literal('relationship')]),
 }).strict(),
 onRelease:z.array(operationSchema).min(1).max(8),
 presentation:abilityId,
}).strict().superRefine((ability,ctx)=>{
 const params = ability.ranks.map(r=>Object.keys(r).sort().join(','));
 if(params.some(p=>p!==params[0]))ctx.addIssue({code:'custom',path:['ranks'],message:'Every rank must declare the same parameters'});
 for(const [i,rank] of ability.ranks.entries())if(Object.keys(rank).length>24)ctx.addIssue({code:'custom',path:['ranks',i],message:'Maximum 24 rank parameters'});
 const check=(amount:Amount,path:(string|number)[],max:number)=>{
  for(const [i,rank] of ability.ranks.entries()){
   const v=typeof amount==='number'?amount:rank[amount.rankParameter];
   if(v===undefined)ctx.addIssue({code:'custom',path,message:`Rank ${i+1}: missing parameter ${typeof amount==='number'?'':amount.rankParameter}`});
   else if(v>max)ctx.addIssue({code:'custom',path,message:`Rank ${i+1}: value exceeds ${max}`});
  }
 };
 check(ability.targeting.range,['targeting','range'],128);
 if(ability.targeting.kind==='point'&&!ability.targeting.radius)ctx.addIssue({code:'custom',path:['targeting','radius'],message:'Ground targeting requires an area radius'});
 if(ability.targeting.kind!=='point'&&(ability.targeting.radius!==undefined||ability.cast.channel))ctx.addIssue({code:'custom',path:['targeting'],message:'Area/channel delivery requires a ground target'});
 if(ability.targeting.radius!==undefined)check(ability.targeting.radius,['targeting','radius'],20);
 if(ability.cast.channel){
  check(ability.cast.channel.waves,['cast','channel','waves'],32);check(ability.cast.channel.intervalTicks,['cast','channel','intervalTicks'],400);
  for(const rank of ability.ranks){for(const amount of [ability.cast.channel.waves,ability.cast.channel.intervalTicks])if(value(amount,rank)<1)ctx.addIssue({code:'custom',path:['cast','channel'],message:'Channel waves and interval must be positive'});}
 }
 if(ability.targeting.radius!==undefined&&ability.ranks.some(rank=>value(ability.targeting.radius!,rank)<1))ctx.addIssue({code:'custom',path:['targeting','radius'],message:'Area radius must be positive'});
 check(ability.cast.cost.amount,['cast','cost','amount'],1_000_000);
 check(ability.cast.cooldown.ticks,['cast','cooldown','ticks'],144_000);
 for(const [i,op]of ability.onRelease.entries()){
  if(op.op==='branch')for(const key of ['then','else'] as const)for(const [j,e]of op[key].entries())check(e.amount,['onRelease',i,key,j,'amount'],1_000_000);
  else check(op.amount,['onRelease',i,'amount'],op.op==='summon'?8:1_000_000);
 }
 const effects=ability.onRelease.flatMap(op=>op.op==='branch'?[...op.then,...op.else]:[op]);
 const ids=effects.filter(e=>e.op==='status').map(e=>e.id);
 if(new Set(ids).size!==ids.length)ctx.addIssue({code:'custom',message:'Status IDs must be unique within an ability'});
 for(const e of effects){
  if(e.op==='status'){
   check(e.amount,['onRelease'],144000);
   if(e.heroDuration!==undefined)check(e.heroDuration,['onRelease'],144000);
   if(e.periodic)check(e.periodic.damage,['onRelease'],1000000);
   if(ability.ranks.some(r=>value(e.amount,r)<1))ctx.addIssue({code:'custom',message:'Status duration must be positive'});
  }
  if(e.op==='summon')check(e.amount,['onRelease'],8);
 }
 if(ability.activation==='passive' && (!ability.aura||ability.targeting.kind!=='self'||effects.some(e=>e.op!=='status'||e.periodic||e.stun||e.disarm)||ability.delivery||ability.cast.channel||ability.autocast))ctx.addIssue({code:'custom',message:'Passives require a self aura with modifier statuses only'});
 if(ability.activation!=='passive'&&ability.aura)ctx.addIssue({code:'custom',message:'Only passive abilities declare auras'});
 if(ability.delivery && (ability.cast.channel||ability.activation==='passive'||ability.delivery.kind==='line'&&ability.targeting.kind!=='point'||ability.delivery.kind!=='line'&&ability.targeting.kind!=='unit'))ctx.addIssue({code:'custom',message:'Delivery does not match targeting'});
 if(ability.delivery?.kind==='chain'){check(ability.delivery.bounces,['delivery','bounces'],16);if(ability.ranks.some(r=>value(ability.delivery!.kind==='chain'?ability.delivery!.bounces:0,r)<1))ctx.addIssue({code:'custom',message:'A chain requires at least one hit'});}
 if(ability.autocast && (ability.targeting.kind!=='unit'||effects.some(e=>e.op!=='status')))ctx.addIssue({code:'custom',message:'Autocast currently supports targeted status buffs'});

});
export type Amount = z.infer<typeof amountSchema>;
export type AbilityDefinition = z.infer<typeof abilitySchema>;
export type Effect = z.infer<typeof effectSchema>;
export type Relation = 'ally'|'enemy'|'neutral';
export type Control = 'player'|'ai'|'scenario';
export const abilityBindingSchema=z.object({
 id:z.string().regex(/^[a-z][a-z0-9-]*$/).max(64),ability:abilityId,initialRank:z.number().int().min(0).max(10),
 controls:z.array(z.enum(['player','ai','scenario'])).min(1).max(3).refine(a=>new Set(a).size===a.length),
 command:z.object({hotkey:z.string().min(1).max(16),column:z.number().int().min(1).max(4),icon:abilityId.optional()}).strict().optional(),
 learning:z.object({requiredLevels:z.array(z.number().int().min(1).max(50)).min(1).max(10)}).strict().optional(),
 ai:z.object({preference:z.enum(['wounded-ally','enemy']),intervalTicks:z.number().int().min(1).max(400)}).strict().optional(),
}).strict();
export const abilityCasterSchema=z.object({
 maxMana:z.number().int().min(1).max(1_000_000),manaRegenPerSecond:z.number().min(0).max(10000).multipleOf(.001),
 bindings:z.array(abilityBindingSchema).min(1).max(12).refine(a=>new Set(a.map(b=>b.id)).size===a.length,'Binding IDs must be unique'),
}).strict();
export type AbilityBinding=z.infer<typeof abilityBindingSchema>;
const colour=z.string().regex(/^#[a-fA-F0-9]{6}$/);
const pulseSchema=z.object({periodTicks:z.number().int().min(1).max(2400),min:z.number().min(0).max(4),max:z.number().min(0).max(4),easing:z.enum(['sine','smoothstep','bounce']),phase:z.number().min(0).max(1).optional()}).strict().refine(p=>p.max>=p.min,'Pulse maximum must be at least its minimum');
export const cueMotionSchema=z.object({
 rotation:z.object({periodTicks:z.number().int().min(1).max(2400),direction:z.enum(['clockwise','counterclockwise']),phaseDegrees:z.number().min(-360).max(360).optional()}).strict().optional(),
 scale:pulseSchema.optional(),opacity:pulseSchema.refine(p=>p.max<=1,'Opacity cannot exceed one').optional(),
}).strict();
export const presentationSchema=z.object({
 schemaVersion:z.literal(1),id:abilityId,icon:abilityId.optional(),
 animations:z.object({prepare:z.string().min(1).max(80),release:z.string().min(1).max(80),recover:z.string().min(1).max(80),fallback:z.string().min(1).max(80),channel:z.string().min(1).max(80).optional()}).strict(),
 cues:z.array(z.object({
  id:z.string().min(1).max(64),event:z.enum(['accepted','released','healed','damaged','cancelled','waveStarted','wave','finished','projectile','impact','statusApplied','dispelled','summoned']),
  anchor:z.enum(['caster','target']),shape:z.enum(['ring','pillar','burst','billboard','streaks','glow','light','rain','missile','beam','wavefront']),
  colour,accent:colour,durationTicks:z.number().int().min(1).max(400),count:z.number().int().min(1).max(128),
  size:z.number().min(.01).max(20),height:z.number().min(0).max(30),
  lifetime:z.enum(['finite','status']).optional(),motion:cueMotionSchema.optional(),
  durationFrom:z.literal('delivery').optional(),sizeFrom:z.literal('radius').optional(),spreadFrom:z.literal('radius').optional(),distribution:z.enum(['point','disc']).optional(),
  fallSpeed:z.number().min(.25).max(8).optional(),launchDelayMs:z.number().min(0).max(500).optional(),fallAngleDegrees:z.number().min(0).max(70).optional(),fallAzimuthDegrees:z.number().min(-360).max(360).optional(),
  impact:z.object({durationTicks:z.number().int().min(1).max(80),count:z.number().int().min(1).max(12),size:z.number().min(.01).max(2),spread:z.number().min(0).max(5),height:z.number().min(0).max(5),colour,accent:colour}).strict().optional(),
  blend:z.enum(['additive','normal']).optional(),orientation:z.enum(['camera','ground']).optional(),
  follow:z.boolean().optional(),intensity:z.number().min(0).max(500).optional(),spread:z.number().min(0).max(20).optional(),length:z.number().min(.01).max(20).optional(),
  texture:z.object({asset:abilityId,role:z.literal('image'),index:z.number().int().min(1).max(32)}).strict().optional(),
 }).strict().refine(c=>c.lifetime!=='status'||c.event==='statusApplied'&&c.anchor==='target'&&['ring','glow','billboard','light'].includes(c.shape),'Status lifetime requires a target status layer').refine(c=>!c.motion||['ring','glow','billboard','light'].includes(c.shape),'Transform motion requires a layer shape').refine(c=>c.shape==='rain'||[c.fallSpeed,c.launchDelayMs,c.fallAngleDegrees,c.fallAzimuthDegrees,c.impact].every(v=>v===undefined),'Launch, fall and impact settings require rain').refine(c=>!c.texture||['burst','billboard','streaks','rain','missile','wavefront'].includes(c.shape),'This cue does not accept textures').refine(c=>!['billboard','streaks','rain'].includes(c.shape)||!!c.texture,'Billboards and streaks require a published texture')).max(16).refine(c=>new Set(c.map(x=>x.id)).size===c.length,'Cue IDs must be unique'),
}).strict();
export type AbilityPresentation=z.infer<typeof presentationSchema>;
export const abilityLibrarySchema=z.object({schemaVersion:z.literal(1),abilities:z.array(abilitySchema).max(2048),presentations:z.array(presentationSchema).max(2048)}).strict().superRefine((library,ctx)=>{
 for(const key of ['abilities','presentations']as const)if(new Set(library[key].map(v=>v.id)).size!==library[key].length)ctx.addIssue({code:'custom',path:[key],message:'Duplicate definition ID'});
 const ids=new Set(library.presentations.map(p=>p.id));
 library.abilities.forEach((a,i)=>{if(!ids.has(a.presentation))ctx.addIssue({code:'custom',path:['abilities',i,'presentation'],message:'Unknown presentation'});});
});
export type AbilityLibrary=z.infer<typeof abilityLibrarySchema>;
export const emptyAbilityLibrary=():AbilityLibrary=>({schemaVersion:1,abilities:[],presentations:[]});
export function value(amount:Amount,rank:Record<string,number>):number{return typeof amount==='number'?amount:rank[amount.rankParameter];}
export function releaseEffects(ability:AbilityDefinition,rank:number,relation:Relation){
 const parameters=ability.ranks[rank-1];if(!parameters)throw Error('Unsupported ability rank');
 return ability.onRelease.flatMap(op=>op.op==='branch'?(op.condition.is===relation?op.then:op.else):[op]).map(op=>({...op,amount:value(op.amount,parameters)}));
}

export function statusDefinition(ability:AbilityDefinition,id:string){return ability.onRelease.flatMap(op=>op.op==='branch'?[...op.then,...op.else]:[op]).find((e):e is StatusEffect=>e.op==='status'&&e.id===id);}
