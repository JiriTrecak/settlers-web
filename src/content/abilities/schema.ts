import {locomotionSchema,targetFilterSchema,abilityConditionSchema,matchesAbilityCondition,type ConditionContext} from './conditions.ts';
export {targetFilterSchema} from './conditions.ts';
import {effectBindingSchema} from '../effects/schema.ts';
import {z} from 'zod';
import {itemModifiersSchema} from '../items.ts';

export const ABILITY_ABI = 'abilities-1';
export const abilityId = z.string().regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/).max(160);
const uint = z.number().int().min(0).max(1_000_000);
const ticks = uint.max(144_000);
const parameter = z.string().regex(/^[a-z][a-zA-Z0-9]*$/).max(48);
export const amountSchema = z.union([uint, z.object({rankParameter: parameter}).strict()]);
/** Ranked weapon policies, shared by learned passives and timed status grants. */
export const combatModifiersSchema=z.object({
 attackBonus:z.object({status:parameter.describe('Optional status template applied on a damaging weapon hit, before death resolution.').optional(),amount:amountSchema,manaCost:amountSchema,weapon:z.enum(['melee','projectile','any']),blockedBySilence:z.boolean().default(true),filter:targetFilterSchema.optional()}).strict().optional(),
 critical:z.object({chancePermille:amountSchema,multiplierPermille:amountSchema}).strict().optional(),
 evasionPermille:amountSchema.optional(),
 cleave:z.object({damagePermille:amountSchema,radius:amountSchema,arcDegrees:z.number().min(1).max(360),maxTargets:z.number().int().min(1).max(32),includeBuildings:z.boolean().default(false),filter:targetFilterSchema.optional()}).strict().optional(),
}).strict();
/** Aim belongs to the ability; each operation independently chooses its recipients. */
export const recipientQuerySchema=z.object({
 center:z.enum(['caster','target','point']),radius:amountSchema,
 relations:z.array(z.enum(['ally','enemy'])).min(1).max(2),
 allowSelf:z.boolean().default(false),includeBuildings:z.boolean().default(false),
 excludePrimary:z.boolean().default(false),maxTargets:z.number().int().min(1).max(128).default(128),
 order:z.enum(['nearest','lowest-health']).default('nearest'),
}).strict();
const recipients={target:z.enum(['target','caster']),query:recipientQuerySchema.optional(),filter:targetFilterSchema.optional()};
export const amountScaleSchema=z.discriminatedUnion('source',[
 z.object({source:z.enum(['caster','target','recipient']),stat:z.enum(['health','maxHealth','missingHealth','mana','maxMana','missingMana']),permille:amountSchema}).strict(),
 z.object({source:z.literal('result'),id:parameter,stat:z.enum(['applied','count','health','maxHealth','mana','maxMana']),permille:amountSchema}).strict(),
]).describe('Add floor(stat × permille / 1000) to amount, capped at one million. Target is the primary aim; recipient is the current operation recipient. Named results come from earlier operations in this release only.');
const magnitude={amount:amountSchema,scale:amountScaleSchema.optional(),record:parameter.describe('Record applied amount, successful recipient count and their pre-operation resources for later operations in this release.').optional()};
const heal = z.object({op:z.literal('heal'), ...recipients, ...magnitude}).strict();
const damage = z.object({op:z.literal('damage'), ...recipients, ...magnitude, damageType:z.string().min(1).max(80)}).strict();
export const controlKindSchema=z.enum(['stun','root','silence','disarm','itemBlocked','moveSlow','attackSlow']);
export type ControlKind=z.infer<typeof controlKindSchema>;
export const statusEffectSchema=z.object({op:z.literal('status'),...recipients,id:parameter,
 amount:amountSchema,heroDuration:amountSchema.optional(),polarity:z.enum(['positive','negative']),dispel:z.boolean(),
 controlImmunity:z.array(controlKindSchema).min(1).max(7).refine(a=>new Set(a).size===a.length,'Duplicate control immunity').describe('Blocks incoming control components; suppresses existing controls while active without removing their timers or other effects.').optional(),
 ethereal:z.boolean().describe("Cannot attack or take non-spell damage; remains visible, collidable and spell-targetable. Independent of disarm immunity.").optional(),
 damageTakenPermille:z.record(z.string().min(1).max(80),amountSchema).refine(m=>Object.keys(m).length>0&&Object.keys(m).length<=16,"Use 1–16 damage types").describe("1000 is unchanged. Strongest vulnerability and strongest reduction per damage type combine once, before armor and shields.").optional(),
 combatModifiers:combatModifiersSchema.optional(),
 stacking:z.object({max:z.number().int().min(2).max(16),scope:z.enum(['source','ability'])}).strict().describe('Refresh all stacks on reapplication. Additive numeric stat modifiers scale per stack; source scope keeps each caster independent.').optional(),
 sourceAttackBonus:amountSchema.describe('Flat bonus per stack to subsequent primary basic attacks from this status source only.').optional(),
 modifiers:itemModifiersSchema.default({}),
 rankedModifiers:z.partialRecord(z.enum(['maxHp','healthRegenPerSecond','manaRegenPerSecond','damage','armor','damagePermille','attackSpeedPermille','moveSpeedPermille','lifestealPermille','meleeReflectionPermille']),amountSchema).optional(),
 stun:z.boolean().optional(),disarm:z.boolean().optional(),silence:z.boolean().optional(),itemBlocked:z.boolean().optional(),
 breakOnDamage:z.boolean().optional(),shield:amountSchema.optional(),
 onShieldDepleted:z.enum(['retain','remove']).describe('Finite shield exhaustion: retain (default) keeps the status and its other payload until its ordinary lifetime ends; remove ends the whole status, including modifiers, reactions and bound visuals, immediately after absorbing the final point. Requires a positive shield at every rank. Does not apply to mana shields.').optional(),
 concealment:z.object({fadeTicks:ticks.max(400),breakOnAttack:z.boolean(),breakOnCast:z.boolean(),attackBonus:amountSchema.default(0)}).strict().optional(),
 detectionRadius:amountSchema.optional(),
 form:z.object({movement:z.object({locomotion:locomotionSchema,flightHeight:z.number().min(1).max(30).optional()}).strict().refine(m=>m.locomotion==='air'||m.flightHeight===undefined,'Flight height requires air movement').describe('Changes navigation and target class. Grounding uses nearby safe placement; blocked landings remain airborne until space opens.').optional(),opacity:z.number().min(.1).max(1).default(1),asset:abilityId.optional(),combatProfile:abilityId.describe("Unit definition supplying weapon damage, range, timing and projectile policy").optional(),scale:z.number().min(.25).max(3).default(1)}).strict().describe("Temporary model/visual scale; body clearance stays unchanged. Combine with status modifiers and restrictions.").optional(),
 lifetime:z.enum(['duration','instance','untilDeath']).default('duration'),
 manaShield:z.object({damagePerMana:z.number().min(1).max(10),absorbPermille:z.number().int().min(1).max(1000)}).strict().optional(),
 immunity:z.enum(['spell','physical']).optional(),
 spellImmunity:z.enum(['hostile','all']).describe('Rejects spell operations, including control and resource effects; existing periodic effects are suppressed, not removed.').optional(),

 periodic:z.object({intervalTicks:ticks.min(1),damage:amountSchema,damageType:z.string().min(1)}).strict().optional(),
}).strict();
const dispel=z.object({op:z.literal('dispel'),...recipients,amount:amountSchema,damageType:z.string().min(1),polarity:z.enum(['all','positive','negative'])}).strict();
export const rankedReferenceSchema=z.union([abilityId,z.object({byRank:z.array(abilityId).min(1).max(10)}).strict()]).describe('One definition for all ranks, or exactly one definition ID per ability rank.');
export function referenceAtRank(reference:z.infer<typeof rankedReferenceSchema>,rank:number):string{return typeof reference==='string'?reference:reference.byRank[rank-1];}
export const corpseQuerySchema=z.object({radius:amountSchema,relations:z.array(z.enum(['ally','enemy','neutral'])).min(1).max(3),filter:targetFilterSchema.optional(),order:z.enum(['nearest','strongest']).default('nearest')}).strict();
const summon=z.object({op:z.literal('summon'),target:z.enum(['target','caster','point']),query:recipientQuerySchema.optional(),amount:amountSchema,definition:rankedReferenceSchema,durationTicks:amountSchema.optional().describe('Omit for a permanent summon; finite lifetimes use simulation ticks.'),endsWithCaster:z.boolean().optional().describe('Remove this summon when its source dies, disappears or changes controller.'),maxActive:amountSchema.optional().describe('Maximum living summons retained by this owner from this caster and ability, across all ranks. Omit for the shared unit limit only.'),replace:z.boolean(),radius:z.number().min(1).max(12),grants:z.array(parameter).max(8).optional(),corpses:corpseQuerySchema.extend({maxTargets:amountSchema.describe('Maximum corpses consumed; amount summons are created per successful corpse.')}).optional()}).strict();
const split=z.object({op:z.literal('split'),id:parameter,query:z.never().optional(),target:z.literal('caster'),amount:amountSchema.describe('Linked form lifetime in ticks'),members:z.array(rankedReferenceSchema).min(2).max(8).describe('Distinct member slots in return-anchor priority order; each may use a ranked definition'),radius:z.number().int().min(1).max(12),returnHealthPermille:amountSchema.optional().describe('Omit to preserve current health; otherwise set this fraction on successful return'),returnManaPermille:amountSchema.optional().describe('Omit to preserve current mana'),onAllLost:z.enum(['kill','return']).default('kill')}).strict();
const revive=z.object({op:z.literal('revive'),id:parameter,target:z.literal('caster'),query:recipientQuerySchema.optional(),amount:amountSchema.describe('Delay before a fallen hero returns, in ticks.'),healthPermille:amountSchema,manaPermille:amountSchema,placementRadius:z.number().int().min(0).max(12),placementWaitTicks:ticks.max(1200).default(400)}).strict();
const resurrect=z.object({op:z.literal('resurrect'),ownership:z.enum(['original','caster']).optional(),durationTicks:amountSchema.optional(),grants:z.array(parameter).max(8).optional(),target:z.enum(['caster','point']),query:recipientQuerySchema.optional(),amount:amountSchema,corpses:corpseQuerySchema,healthPermille:amountSchema,manaPermille:amountSchema,placementRadius:z.number().int().min(0).max(12),supply:z.enum(['require','allow-over-cap']).default('require')}).strict();
const contain=z.object({op:z.literal('contain'),id:parameter,...recipients,shareVision:z.boolean().optional().describe('Share the carrier ordinary sight with the contained unit owner and allies; does not grant detection or control'),amount:amountSchema.describe('Maximum containment duration in ticks'),lifetime:z.enum(['duration','untilDeath']).default('duration'),capacity:z.number().int().min(1).max(8),digestion:z.object({intervalTicks:ticks.min(1).max(400),damage:amountSchema,damageType:z.string().min(1).max(80)}).strict().optional()}).strict();
const releaseContained=z.object({op:z.literal('releaseContained'),...recipients,amount:z.number().int().min(1).max(1)}).strict();
const convert=z.object({op:z.literal('convert'),...recipients,amount:z.number().int().min(1).max(1),supply:z.enum(['require','allow-over-cap']).default('require')}).strict();
const teleport=z.object({op:z.literal('teleport'),...recipients,amount:amountSchema.describe('Arrival clearance search radius in world units'),destination:z.enum(['point','caster','target']),preserveOffset:z.boolean()}).strict();
const vision=z.object({op:z.literal('vision'),id:parameter,target:z.enum(['point','caster','target']),query:recipientQuerySchema.optional(),amount:amountSchema.describe('Vision lifetime in simulation ticks'),radius:amountSchema,ignoreTerrain:z.boolean(),detectInvisible:z.boolean().default(false),endsWithCaster:z.boolean()}).strict();
const drain=z.object({op:z.literal('drain'),...recipients,...magnitude,resource:z.enum(['health','mana']),restoreCaster:z.boolean(),damageType:z.string().min(1).max(80),damagePerDrainedPermille:z.number().int().min(0).max(2000).default(0)}).strict();
const mana=z.object({op:z.literal('mana'),...recipients,...magnitude}).strict();
const sacrifice=z.object({op:z.literal('sacrifice'),...recipients,amount:z.number().int().min(1).max(1),record:parameter.optional()}).strict().describe('Kill an owned non-hero unit other than the caster. Bypasses damage mitigation; ordinary death cleanup still runs. Records resources only on success.');
export const effectSchema = z.discriminatedUnion('op',[heal,damage,statusEffectSchema,dispel,summon,split,resurrect,revive,drain,mana,teleport,vision,convert,contain,releaseContained,sacrifice]);
export type StatusEffect=z.infer<typeof statusEffectSchema>;
export const deliverySchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('charge'),speed:z.number().min(1).max(60),maxTicks:ticks.min(1).max(400)}).strict().describe('Move the grounded caster toward a unit using body and terrain clearance. Stop on obstruction, interruption or timeout; apply release operations only on contact.'),
 z.object({kind:z.literal('swarm'),count:amountSchema,durationTicks:amountSchema,speed:z.number().min(1).max(100),radius:z.number().min(1).max(32),launchIntervalTicks:ticks.max(40),attackIntervalTicks:ticks.min(1).max(400),maxPerTarget:z.number().int().min(1).max(32),returnThreshold:amountSchema,returnPermille:z.number().int().min(0).max(1000),maxHitsPerTrip:z.number().int().min(1).max(32),returnTimeoutTicks:ticks.min(1).max(4000),filter:targetFilterSchema.optional(),includeBuildings:z.boolean().default(false)}).strict().describe('Self-cast seekers execute onRelease on visible enemies. Drain restoreCaster is carried home before restoration; damage-only seekers return after maxHitsPerTrip.'),
 z.object({kind:z.literal('projectile'),speed:z.number().min(1).max(100)}).strict(),
 z.object({kind:z.literal('chain'),skipFullHealth:z.boolean().default(false),bounces:amountSchema,radius:z.number().min(1).max(20),intervalTicks:ticks.min(1).max(80),retentionPermille:z.number().int().min(1).max(1000)}).strict(),
 z.object({kind:z.literal('line'),speed:z.number().min(1).max(100),length:z.number().min(1).max(64),width:z.number().min(.1).max(10)}).strict(),
]);
const program = z.array(effectSchema).min(1).max(8);
export const operationSchema = z.union([effectSchema,z.object({
 op:z.literal('branch'),
 condition:abilityConditionSchema,
 then:program,else:program,
}).strict()]);
export const abilitySchema = z.object({
 schemaVersion:z.literal(1), id:abilityId, name:z.string().trim().min(1).max(100), description:z.string().max(2000).default(''),
 activation:z.enum(['targeted','passive']),
 weaponCast:z.object({bonus:amountSchema,weapon:z.enum(['melee','projectile','any']),status:parameter.optional()}).strict().describe('A single enhanced normal weapon attack; uses weapon timing and cast mana/cooldown. Autocast enhances existing attacks.').optional(),
 combatModifiers:combatModifiersSchema.optional(),
 piercesSpellImmunity:z.boolean().optional(),
 persistent:z.object({durationTicks:amountSchema,intervalTicks:amountSchema,anchor:z.enum(['point','caster','target']),
 endsWithCaster:z.boolean().default(true),tetherRange:z.number().min(1).max(128).optional(),
 upkeepMana:amountSchema.default(0),toggle:z.boolean().default(false),
 }).strict().optional(),
 delivery:deliverySchema.optional(),
 aura:z.object({radius:z.number().min(1).max(32),meleeOnly:z.boolean()}).strict().optional(),
 autocast:z.object({intervalTicks:ticks.min(1).max(400),enabledByDefault:z.boolean()}).strict().optional(),
 ranks:z.array(z.record(parameter,z.number().int().min(-1_000_000).max(1_000_000))).min(1).max(10),
 targeting:z.object({condition:abilityConditionSchema.optional(),filter:targetFilterSchema.optional(),includeBuildings:z.boolean().optional(),kind:z.enum(['unit','point','self']),radius:amountSchema.optional(),maxTargets:z.number().int().min(1).max(128).optional(),alive:z.literal(true),visible:z.boolean(),relations:z.array(z.enum(['ally','enemy'])).min(1).max(2).refine(a=>new Set(a).size===a.length,'Duplicate relationship'),allowSelf:z.boolean(),range:amountSchema,outOfRange:z.literal('reject')}).strict(),
 cast:z.object({prepareTicks:ticks,recoverTicks:ticks,
  channel:z.object({waves:amountSchema,intervalTicks:amountSchema,tetherRange:z.number().min(1).max(128).optional()}).strict().optional(),
  cost:z.object({resource:z.literal('mana'),amount:amountSchema,commit:z.literal('release')}).strict(),
  cooldown:z.object({ticks:amountSchema,start:z.literal('release'),scope:z.literal('ability')}).strict(),
  cancelBeforeRelease:z.literal('refund'),
  revalidateAtRelease:z.tuple([z.literal('caster'),z.literal('target'),z.literal('range'),z.literal('visibility'),z.literal('relationship')]),
 }).strict(),
 statuses:z.array(statusEffectSchema).max(8).describe('Reusable status templates; declared here but applied only by an explicit reference.').optional(),
 onRelease:z.array(operationSchema).max(8),
 triggers:z.array(z.object({id:parameter,event:z.enum(['interval','weaponRelease','weaponHit','meleeDamaged','damaged','death','kill']),
  intervalTicks:amountSchema.optional().describe('Required for interval triggers; first pulse occurs after this many ticks, never immediately.'),
  weapon:z.enum(['melee','projectile','siege']).describe('Optional weapon-kind restriction for weaponRelease triggers.').optional(),
  blockedBySilence:z.boolean().describe('Whether silence prevents a weaponRelease or interval proc; ordinary attacks still fire.').optional(),
  includeBuildings:z.boolean().optional(),
  filter:targetFilterSchema.describe('For kill or weaponRelease, filters the hostile victim before counting, rolling or spending mana.').optional(),
  executor:z.literal('statusSource').describe('Death triggers on a status may execute for its original applier, retaining ownership after removal or conversion.').optional(),
  cooldownTicks:amountSchema.optional(),whileStatus:parameter.optional(),chancePermille:z.number().int().min(1).max(1000).default(1000),
  every:z.number().int().min(1).max(100).default(1),manaCost:amountSchema.default(0),
  operations:z.array(operationSchema).min(1).max(8),
 }).strict()).max(8).optional(),
 presentation:abilityId,
}).strict().superRefine((ability,ctx)=>{
 const params = ability.ranks.map(r=>Object.keys(r).sort().join(','));
 if(params.some(p=>p!==params[0]))ctx.addIssue({code:'custom',path:['ranks'],message:'Every rank must declare the same parameters'});
 for(const [i,rank] of ability.ranks.entries())if(Object.keys(rank).length>24)ctx.addIssue({code:'custom',path:['ranks',i],message:'Maximum 24 rank parameters'});
 const check=(amount:Amount,path:(string|number)[],max:number)=>{
  for(const [i,rank] of ability.ranks.entries()){
   const v=typeof amount==='number'?amount:rank[amount.rankParameter];
   if(v===undefined)ctx.addIssue({code:'custom',path,message:`Rank ${i+1}: missing parameter ${typeof amount==='number'?'':amount.rankParameter}`});
   else if(v<0||v>max)ctx.addIssue({code:'custom',path,message:`Rank ${i+1}: value must be between 0 and ${max}`});
  }
 };
 const checkCombat=(m:z.infer<typeof combatModifiersSchema>)=>{
  if(m.attackBonus){if(m.attackBonus.status){const mark=ability.statuses?.find(s=>s.id===m.attackBonus!.status);if(!mark||mark.target!=='target'||mark.query||mark.lifetime==='instance')ctx.addIssue({code:'custom',message:'Weapon marks require a target-only status template with an independent lifetime'});}check(m.attackBonus.amount,['combatModifiers','attackBonus','amount'],1000000);check(m.attackBonus.manaCost,['combatModifiers','attackBonus','manaCost'],1000000);}
  if(m.critical){check(m.critical.chancePermille,['combatModifiers','critical','chancePermille'],1000);check(m.critical.multiplierPermille,['combatModifiers','critical','multiplierPermille'],10000);if(ability.ranks.some(r=>value(m.critical!.multiplierPermille,r)<1000))ctx.addIssue({code:'custom',message:'Critical multiplier must be at least 1000'});}
  if(m.evasionPermille!==undefined)check(m.evasionPermille,['combatModifiers','evasionPermille'],1000);
  if(m.cleave){check(m.cleave.damagePermille,['combatModifiers','cleave','damagePermille'],1000);check(m.cleave.radius,['combatModifiers','cleave','radius'],32);if(ability.ranks.some(r=>value(m.cleave!.radius,r)<1))ctx.addIssue({code:'custom',message:'Cleave radius must be positive'});}
  if(!m.attackBonus&&!m.critical&&m.evasionPermille===undefined&&!m.cleave)ctx.addIssue({code:'custom',message:'Combat modifiers require at least one policy'});
 };
 if(ability.weaponCast){
  const w=ability.weaponCast;
  check(w.bonus,['weaponCast','bonus'],1000000);
  if(ability.activation!=='targeted'||ability.targeting.kind!=='unit'||ability.targeting.allowSelf||ability.targeting.relations.length!==1||ability.targeting.relations[0]!=='enemy'||ability.delivery||ability.persistent||ability.aura||ability.combatModifiers||ability.cast.channel||ability.cast.prepareTicks||ability.cast.recoverTicks||ability.onRelease.length)ctx.addIssue({code:'custom',message:'Weapon casts require a targeted enemy unit, zero spell preparation/recovery, and no release program, channel, delivery, persistent or passive modifiers'});
  if(w.status){const mark=ability.statuses?.find(s=>s.id===w.status);if(!mark||mark.target!=='target'||mark.query||mark.lifetime==='instance')ctx.addIssue({code:'custom',message:'Weapon casts require a target-only status template with an independent lifetime'});}
  if(!w.status&&ability.ranks.some(r=>value(w.bonus,r)===0))ctx.addIssue({code:'custom',message:'Weapon casts need damage or an impact status'});
 }
 if(ability.combatModifiers){checkCombat(ability.combatModifiers);if(ability.activation!=='passive')ctx.addIssue({code:'custom',message:'Direct combat modifiers require a passive ability; targeted spells grant them through statuses'});}
 check(ability.targeting.range,['targeting','range'],4096);
 if(!ability.targeting.visible&&ability.targeting.kind==='unit')ctx.addIssue({code:'custom',message:'Unit aims require visibility; remote scouting uses a point aim'});
 if(ability.targeting.kind==='point'&&!ability.targeting.radius)ctx.addIssue({code:'custom',path:['targeting','radius'],message:'Ground targeting requires an area radius'});
 if(ability.targeting.kind!=='point'&&ability.targeting.radius!==undefined)ctx.addIssue({code:'custom',path:['targeting'],message:'Use an operation recipient query for unit/self area effects'});
 if(ability.targeting.radius!==undefined)check(ability.targeting.radius,['targeting','radius'],20);
 if(ability.cast.channel){
  check(ability.cast.channel.waves,['cast','channel','waves'],64);check(ability.cast.channel.intervalTicks,['cast','channel','intervalTicks'],400);
  for(const rank of ability.ranks){for(const amount of [ability.cast.channel.waves,ability.cast.channel.intervalTicks])if(value(amount,rank)<1)ctx.addIssue({code:'custom',path:['cast','channel'],message:'Channel waves and interval must be positive'});}
 }
 if(ability.targeting.radius!==undefined&&ability.ranks.some(rank=>value(ability.targeting.radius!,rank)<1))ctx.addIssue({code:'custom',path:['targeting','radius'],message:'Area radius must be positive'});
 check(ability.cast.cost.amount,['cast','cost','amount'],1_000_000);
 check(ability.cast.cooldown.ticks,['cast','cooldown','ticks'],144_000);
 for(const [i,op]of ability.onRelease.entries()){
  if(op.op==='branch')for(const key of ['then','else'] as const)for(const [j,e]of op[key].entries())check(e.amount,['onRelease',i,key,j,'amount'],1_000_000);
  else check(op.amount,['onRelease',i,'amount'],op.op==='summon'?8:1_000_000);
 }
 const effects=allEffects(ability);
 for(const program of [ability.onRelease,...(ability.triggers??[]).map(t=>t.operations)]){
  const records=new Set<string>();
  for(const operation of program)for(const e of operation.op==='branch'?[...operation.then,...operation.else]:[operation]){
   if('scale' in e&&e.scale){
    check(e.scale.permille,['scale','permille'],10000);
    if(e.scale.source==='target'&&ability.targeting.kind==='point')ctx.addIssue({code:'custom',message:'Point aims have no resource stats; use recipient for area operations'});
    if(e.scale.source==='result'&&!records.has(e.scale.id))ctx.addIssue({code:'custom',message:'Result scaling must reference an earlier record in the same program'});
   }
   if('record' in e&&e.record){if(records.has(e.record))ctx.addIssue({code:'custom',message:'Result record names must be unique within each program'});records.add(e.record);}
  }
 }
 const containmentIds=effects.filter(e=>e.op==='contain').map(e=>e.id);
 if(new Set(containmentIds).size!==containmentIds.length)ctx.addIssue({code:'custom',message:'Containment IDs must be unique within an ability'});
 const revivalIds=effects.filter(e=>e.op==='revive').map(e=>e.id);
 if(new Set(revivalIds).size!==revivalIds.length)ctx.addIssue({code:'custom',message:'Revival IDs must be unique within an ability'});
 const visionIds=effects.filter(e=>e.op==='vision').map(e=>e.id);
 if(new Set(visionIds).size!==visionIds.length)ctx.addIssue({code:'custom',message:'Vision IDs must be unique within an ability'});
 const ids=effects.filter(e=>e.op==='status').map(e=>e.id);
 if(new Set(ids).size!==ids.length)ctx.addIssue({code:'custom',message:'Status IDs must be unique within an ability'});
 for(const e of effects){
  if(e.query){
   check(e.query.radius,['onRelease','query','radius'],32);
   if(ability.ranks.some(r=>value(e.query!.radius,r)<1))ctx.addIssue({code:'custom',message:'Recipient query radius must be positive'});
   if(e.target==='point')ctx.addIssue({code:'custom',message:'Point operations run once and cannot declare a unit query'});
  }
  if(e.op==='status'){
   if(e.sourceAttackBonus!==undefined){check(e.sourceAttackBonus,['status','sourceAttackBonus'],1000000);if(e.stacking?.scope!=='source')ctx.addIssue({code:'custom',message:'Source attack bonuses require source-scoped stacking'});}
   if(e.stacking){
    if(ability.aura||e.lifetime!=='duration'||e.form||e.periodic||e.shield!==undefined||e.manaShield||e.combatModifiers||e.concealment)ctx.addIssue({code:'custom',message:'Stacking supports independent duration statuses with additive stat modifiers, not auras, forms, periodic damage or shields'});
    for(const rank of ability.ranks){const m={...e.modifiers,...Object.fromEntries(Object.entries(e.rankedModifiers??{}).map(([k,v])=>[k,value(v,rank)]))};for(const k of Object.keys(m))if(typeof m[k as keyof typeof m]==='number')(m as Record<string,unknown>)[k]=Number(m[k as keyof typeof m])*e.stacking.max;if(!itemModifiersSchema.safeParse(m).success)ctx.addIssue({code:'custom',message:'Maximum stacked modifiers exceed stat bounds'});}
   }
   if(e.combatModifiers)checkCombat(e.combatModifiers);
   for(const [kind,n] of Object.entries(e.damageTakenPermille??{}))check(n,["onRelease","damageTakenPermille",kind],5000);
   if(e.form&&ability.aura)ctx.addIssue({code:'custom',message:'Forms require timed statuses, not continuously reapplied auras'});
   if(e.concealment){check(e.concealment.attackBonus,['onRelease','concealment','attackBonus'],1000000);if(ability.aura)ctx.addIssue({code:'custom',message:'Concealment requires a timed status, not a continuously reapplied aura'});}
   if(e.detectionRadius!==undefined){check(e.detectionRadius,['onRelease','detectionRadius'],64);if(ability.ranks.some(r=>value(e.detectionRadius!,r)<1))ctx.addIssue({code:'custom',message:'Detection radius must be positive'});}
   if(e.lifetime==='instance'&&!ability.persistent)ctx.addIssue({code:'custom',message:'Instance-linked statuses require a persistent ability'});
   check(e.amount,['onRelease'],144000);
   if(e.heroDuration!==undefined)check(e.heroDuration,['onRelease'],144000);
   if(e.periodic)check(e.periodic.damage,['onRelease'],1000000);
   if(e.shield!==undefined)check(e.shield,['onRelease','shield'],1_000_000);
   if(e.onShieldDepleted&&(e.shield===undefined||ability.ranks.some(r=>value(e.shield!,r)<=0)))ctx.addIssue({code:'custom',message:'Shield exhaustion policy requires a positive finite shield at every rank'});
   if(e.rankedModifiers)for(const rank of ability.ranks){
    const modifiers={...e.modifiers,...Object.fromEntries(Object.entries(e.rankedModifiers).map(([key,n])=>[key,value(n,rank)]))};
    if(Object.values(modifiers).some(v=>v===undefined)||!itemModifiersSchema.safeParse(modifiers).success)ctx.addIssue({code:'custom',message:'Ranked modifiers must resolve to valid shared modifiers'});
   }
   if(e.lifetime==='untilDeath'&&(ability.aura||e.heroDuration!==undefined||ability.ranks.some(r=>value(e.amount,r)!==0)))ctx.addIssue({code:'custom',message:'Until-death statuses require amount 0, no hero duration and no aura'});
   if(e.lifetime!=='untilDeath'&&ability.ranks.some(r=>value(e.amount,r)<1))ctx.addIssue({code:'custom',message:'Status duration must be positive'});
  }
  if(e.op==='summon'){
   if(e.maxActive!==undefined){check(e.maxActive,['onRelease','maxActive'],128);if(ability.ranks.some(r=>value(e.maxActive!,r)<1))ctx.addIssue({code:'custom',message:'Summon maximum active count must be positive'});}
   check(e.amount,['onRelease'],8);if(e.durationTicks!==undefined)check(e.durationTicks,['onRelease','durationTicks'],144000);
   if(e.durationTicks!==undefined&&ability.ranks.some(r=>value(e.durationTicks!,r)<1))ctx.addIssue({code:'custom',message:'Summon duration must be positive'});
   if(e.corpses){
    check(e.corpses.radius,['onRelease','corpses','radius'],32);check(e.corpses.maxTargets,['onRelease','corpses','maxTargets'],8);
    if(e.query||e.target==='target'||ability.ranks.some(r=>value(e.amount,r)<1||value(e.corpses!.radius,r)<1||value(e.corpses!.maxTargets,r)<1||value(e.amount,r)*value(e.corpses!.maxTargets,r)>8))ctx.addIssue({code:'custom',message:'Corpse summons require a caster/point anchor, no live query, positive count/radius/limit and at most eight units per operation'});
   }
   if(typeof e.definition!=='string'&&e.definition.byRank.length!==ability.ranks.length)ctx.addIssue({code:'custom',message:'Summon definitions must cover every ability rank exactly'});
  }
  if((e.op==='summon'||e.op==='resurrect')&&e.grants){
   if(new Set(e.grants).size!==e.grants.length)ctx.addIssue({code:'custom',message:'Duplicate creation grant'});
   for(const id of e.grants){const grant=ability.statuses?.find(s=>s.id===id);if(!grant||grant.target!=='target'||grant.query||grant.lifetime==='instance')ctx.addIssue({code:'custom',message:'Creation grants must reference declared target-only status templates with independent lifetimes'});}
  }
  if(e.op==='split'){
   check(e.amount,['split','amount'],144000);
   for(const key of ['returnHealthPermille','returnManaPermille'] as const)if(e[key]!==undefined)check(e[key]!,['split',key],1000);
   if(ability.ranks.some(r=>value(e.amount,r)<1||e.returnHealthPermille!==undefined&&value(e.returnHealthPermille,r)<1)||e.members.some(m=>typeof m!=='string'&&m.byRank.length!==ability.ranks.length))ctx.addIssue({code:'custom',message:'Split requires positive lifetime/return health and member definitions for every rank'});
   if(ability.targeting.kind!=='self'||ability.activation==='passive'||ability.delivery||ability.persistent||ability.cast.channel||ability.onRelease.length!==1||ability.onRelease[0]!==e)ctx.addIssue({code:'custom',message:'Split is an atomic direct self-cast operation, not a repeated or triggered payload'});
  }
  if(e.op==='contain'){
   if(e.target==='caster'&&!e.query)ctx.addIssue({code:'custom',message:'A carrier cannot contain itself; select other recipients'});
   check(e.amount,['contain','amount'],144000);if(e.digestion)check(e.digestion.damage,['contain','digestion','damage'],1000000);
   if(ability.ranks.some(r=>value(e.amount,r)<1))ctx.addIssue({code:'custom',message:'Containment duration must be positive'});
  }
  if(e.op==='revive'){
   check(e.amount,['revive','amount'],144000);check(e.healthPermille,['revive','healthPermille'],1000);check(e.manaPermille,['revive','manaPermille'],1000);
   if(e.query||ability.ranks.some(r=>value(e.amount,r)<1||value(e.healthPermille,r)<1))ctx.addIssue({code:'custom',message:'Hero revival requires positive delay/health and no recipient query'});
   if(!ability.triggers?.some(t=>t.event==='death'&&!t.executor&&t.operations.some(o=>o===e||o.op==='branch'&&[...o.then,...o.else].includes(e))))ctx.addIssue({code:'custom',message:'Revive must run on the fallen holder in a death trigger'});
  }
  if(e.op==='resurrect'){
   if(e.durationTicks!==undefined){check(e.durationTicks,['onRelease','durationTicks'],144000);if(ability.ranks.some(r=>value(e.durationTicks!,r)<1))ctx.addIssue({code:'custom',message:'Temporary resurrection duration must be positive'});}
   check(e.amount,['onRelease','amount'],8);check(e.corpses.radius,['onRelease','corpses','radius'],32);check(e.healthPermille,['onRelease','healthPermille'],1000);check(e.manaPermille,['onRelease','manaPermille'],1000);
   if(e.query||ability.ranks.some(r=>value(e.amount,r)<1||value(e.corpses.radius,r)<1||value(e.healthPermille,r)<1))ctx.addIssue({code:'custom',message:'Resurrection requires a corpse query with positive count, radius and health; live-unit queries are not supported'});
  }
  if(e.op==='teleport'){
   check(e.amount,['onRelease','amount'],12);
   if(e.destination==='point'&&ability.targeting.kind!=='point')ctx.addIssue({code:'custom',message:'Point teleport destinations require point targeting'});
   if(e.destination==='target'&&ability.targeting.kind!=='unit')ctx.addIssue({code:'custom',message:'Unit teleport destinations require a unit aim'});
  }
  if(e.op==='vision'){
   check(e.amount,['onRelease','amount'],144000);check(e.radius,['onRelease','radius'],64);
   if(e.query)ctx.addIssue({code:'custom',message:'Vision sources are single anchors, not unit queries'});
   if(ability.ranks.some(r=>value(e.amount,r)<1||value(e.radius,r)<1))ctx.addIssue({code:'custom',message:'Vision duration and radius must be positive'});
  }
 }
 if(ability.activation==='passive' && (ability.targeting.kind!=='self'||(!ability.aura&&!ability.triggers?.length&&!ability.combatModifiers)||(ability.aura&&effects.some(e=>e.op!=='status'||e.periodic||e.stun||e.disarm||e.silence||e.itemBlocked||e.breakOnDamage||e.shield!==undefined||e.immunity||e.spellImmunity||e.manaShield))||ability.delivery||ability.cast.channel||ability.autocast))ctx.addIssue({code:'custom',message:'Passives require a self aura, combat modifiers or triggers; auras only apply modifier statuses'});
 if(ability.activation!=='passive'&&ability.aura)ctx.addIssue({code:'custom',message:'Only passive abilities declare auras'});
 if(ability.delivery && (ability.cast.channel||ability.activation==='passive'||ability.delivery.kind==='line'&&ability.targeting.kind!=='point'||ability.delivery.kind==='swarm'&&ability.targeting.kind!=='self'||(ability.delivery.kind==='chain'||ability.delivery.kind==='projectile'||ability.delivery.kind==='charge')&&ability.targeting.kind!=='unit'))ctx.addIssue({code:'custom',message:'Delivery does not match targeting'});
 if(ability.delivery?.kind==='swarm'){
  const d=ability.delivery;for(const [key,max] of [['count',32],['durationTicks',144000],['returnThreshold',1000000]] as const)check(d[key],['delivery',key],max);
  if(ability.ranks.some(r=>value(d.count,r)<1||value(d.durationTicks,r)<1+(value(d.count,r)-1)*d.launchIntervalTicks||value(d.returnThreshold,r)<1))ctx.addIssue({code:'custom',message:'Swarm count and return threshold must be positive, and all seekers must launch before expiry'});
 }
 if(ability.delivery?.kind==='chain'){check(ability.delivery.bounces,['delivery','bounces'],16);if(ability.ranks.some(r=>value(ability.delivery!.kind==='chain'?ability.delivery!.bounces:0,r)<1))ctx.addIssue({code:'custom',message:'A chain requires at least one hit'});}
 if(!ability.onRelease.length&&!ability.triggers?.length&&!ability.combatModifiers&&!ability.weaponCast)ctx.addIssue({code:'custom',message:'An ability requires release operations or triggers'});
 if(ability.persistent){
  const p=ability.persistent;
  for(const [key,max] of [['durationTicks',144000],['intervalTicks',400],['upkeepMana',1000000]] as const)check(p[key],['persistent',key],max);
  if(ability.ranks.some(r=>value(p.intervalTicks,r)<1||value(p.durationTicks,r)<value(p.intervalTicks,r)))ctx.addIssue({code:'custom',message:'Persistent duration must cover at least one positive interval'});
  if(ability.activation==='passive'||ability.delivery||ability.cast.channel)ctx.addIssue({code:'custom',message:'Persistent spells use direct active release'});
  if(p.toggle&&(ability.targeting.kind!=='self'||p.anchor!=='caster'||!p.endsWithCaster))ctx.addIssue({code:'custom',message:'Toggles require a caster-anchored self spell that ends with the caster'});
  if(p.anchor==='target'&&ability.targeting.kind!=='unit'||p.tetherRange!==undefined&&p.anchor!=='target')ctx.addIssue({code:'custom',message:'Target anchors and tethers require a unit target'});
 }
 const triggerIds=new Set<string>();
 for(const trigger of ability.triggers??[]){
  if(triggerIds.has(trigger.id))ctx.addIssue({code:'custom',message:'Duplicate trigger ID'});triggerIds.add(trigger.id);
  if(trigger.whileStatus&&!ids.includes(trigger.whileStatus))ctx.addIssue({code:'custom',message:'Trigger references an unknown status'});
  if(ability.activation!=='passive'&&!trigger.whileStatus)ctx.addIssue({code:'custom',message:'Active ability triggers require an applied status'});
  if((trigger.event==='interval')!==(trigger.intervalTicks!==undefined))ctx.addIssue({code:'custom',message:'Only interval triggers require intervalTicks'});
  if(trigger.intervalTicks!==undefined){check(trigger.intervalTicks,['triggers','intervalTicks'],144000);if(ability.ranks.some(r=>value(trigger.intervalTicks!,r)<1))ctx.addIssue({code:'custom',message:'Trigger interval must be positive'});}
  check(trigger.manaCost,['triggers','manaCost'],1_000_000);
  if(trigger.cooldownTicks!==undefined)check(trigger.cooldownTicks,['triggers','cooldownTicks'],144000);
  if(trigger.executor&&(trigger.event!=='death'||!trigger.whileStatus||ability.ranks.some(r=>value(trigger.manaCost,r)!==0)))ctx.addIssue({code:'custom',message:'Status-source execution requires a death trigger, whileStatus and zero trigger mana cost'});
  if((trigger.filter||trigger.includeBuildings!==undefined)&&trigger.event!=='kill'&&trigger.event!=='weaponRelease')ctx.addIssue({code:'custom',message:'Trigger victim filters require kill or weaponRelease'});
  if(trigger.weapon!==undefined&&trigger.event!=='weaponRelease')ctx.addIssue({code:'custom',message:'Weapon-kind restrictions require weaponRelease'});
  if(trigger.blockedBySilence!==undefined&&trigger.event!=='weaponRelease'&&trigger.event!=='interval')ctx.addIssue({code:'custom',message:'Silence policy requires weaponRelease or interval'});
  if(trigger.event==='interval'&&trigger.whileStatus&&ability.aura)ctx.addIssue({code:'custom',message:'Interval grants require independent statuses, not continuously reapplied auras; use a passive interval with a recipient query'});
  if(trigger.event==='kill')for(const op of trigger.operations)for(const e of op.op==='branch'?[...op.then,...op.else]:[op])if(e.target==='target'&&!e.query)ctx.addIssue({code:'custom',message:'Kill operations require caster, point or queried recipients; the defeated victim is not alive'});
  if(trigger.event==='death')for(const op of trigger.operations)for(const e of op.op==='branch'?[...op.then,...op.else]:[op])if(e.op!=='revive'&&e.target!=='point'&&!e.query&&!(trigger.executor==='statusSource'&&e.target==='caster'))ctx.addIssue({code:'custom',message:'Death operations require a recipient query or point target; the dead holder is not a live recipient'});
  for(const operation of trigger.operations)for(const effect of operation.op==='branch'?[...operation.then,...operation.else]:[operation])check(effect.amount,['triggers','operations'],effect.op==='summon'?8:1_000_000);
 }


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
 ai:z.object({intent:z.enum(['utility','escape','reinforce','scout']).optional(),preference:z.enum(['wounded-ally','enemy']),intervalTicks:z.number().int().min(1).max(400)}).strict().optional(),
}).strict();
export const abilityCasterSchema=z.object({
 maxMana:z.number().int().min(1).max(1_000_000),manaRegenPerSecond:z.number().min(0).max(10000).multipleOf(.001),
 bindings:z.array(abilityBindingSchema).min(1).max(12).refine(a=>new Set(a.map(b=>b.id)).size===a.length,'Binding IDs must be unique'),
}).strict();
export type AbilityBinding=z.infer<typeof abilityBindingSchema>;
export {cueMotionSchema} from '../effects/schema.ts';
export const presentationSchema=z.object({schemaVersion:z.literal(1),id:abilityId,icon:abilityId.optional(),animations:z.object({prepare:z.string().min(1).max(80),release:z.string().min(1).max(80),recover:z.string().min(1).max(80),fallback:z.string().min(1).max(80),channel:z.string().min(1).max(80).optional()}).strict(),effects:z.array(effectBindingSchema).max(32).refine(b=>new Set(b.map(x=>x.id)).size===b.length,'Binding IDs must be unique')}).strict();
export type AbilityPresentation=z.infer<typeof presentationSchema>;
export const abilityLibrarySchema=z.object({schemaVersion:z.literal(1),abilities:z.array(abilitySchema).max(10000),presentations:z.array(presentationSchema).max(10000)}).strict().superRefine((library,ctx)=>{
 for(const key of ['abilities','presentations']as const)if(new Set(library[key].map(v=>v.id)).size!==library[key].length)ctx.addIssue({code:'custom',path:[key],message:'Duplicate definition ID'});
 const ids=new Set(library.presentations.map(p=>p.id));
 library.abilities.forEach((a,i)=>{if(!ids.has(a.presentation))ctx.addIssue({code:'custom',path:['abilities',i,'presentation'],message:'Unknown presentation'});});
});
export type AbilityLibrary=z.infer<typeof abilityLibrarySchema>;
export const emptyAbilityLibrary=():AbilityLibrary=>({schemaVersion:1,abilities:[],presentations:[]});
export function value(amount:Amount,rank:Record<string,number>):number{return typeof amount==='number'?amount:rank[amount.rankParameter];}
export function resolveEffect(op:Effect,rank:number,parameters:Record<string,number>){return op.op==='summon'?{...op,amount:value(op.amount,parameters),maxActive:op.maxActive===undefined?undefined:value(op.maxActive,parameters),definition:referenceAtRank(op.definition,rank),durationTicks:op.durationTicks===undefined?undefined:value(op.durationTicks,parameters)}:{...op,amount:value(op.amount,parameters)};}
export function releaseEffects(ability:AbilityDefinition,rank:number,relation:Relation,subjects:Pick<ConditionContext,'caster'|'target'>={caster:{},target:{}}){
 const parameters=ability.ranks[rank-1];if(!parameters)throw Error('Unsupported ability rank');
 return ability.onRelease.flatMap(op=>op.op==='branch'?(matchesAbilityCondition(op.condition,{relation,...subjects})?op.then:op.else):[op]).map(op=>resolveEffect(op,rank,parameters));
}

export function allEffects(ability:Pick<AbilityDefinition,'onRelease'|'triggers'|'statuses'>){return [...(ability.statuses??[]),...ability.onRelease,...(ability.triggers??[]).flatMap(t=>t.operations)].flatMap(op=>op.op==='branch'?[...op.then,...op.else]:[op]);}
export function statusDefinition(ability:AbilityDefinition,id:string){return allEffects(ability).find((e):e is StatusEffect=>e.op==='status'&&e.id===id);}
