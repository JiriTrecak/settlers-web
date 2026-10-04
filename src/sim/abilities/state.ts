import {locomotionSchema} from '../../content/abilities/conditions';
import {controlKindSchema} from '../../content/abilities/schema';
import {z} from 'zod';
import {abilityId} from '../../content/abilities/schema';
const tick=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const pendingAbilitySchema=z.object({
 id:z.number().int().positive(),binding:z.string(),ability:abilityId,rank:z.number().int().min(1).max(10),
 target:z.number().int().nonnegative(),point:z.object({x:z.number().int().nonnegative().max(4096),y:z.number().int().nonnegative().max(4096)}).strict().optional(),
 channel:z.object({wave:z.number().int().min(0).max(64),nextWaveTick:tick,endTick:tick,origin:z.object({x:z.number(),y:z.number()}).strict()}).strict().optional(),owner:z.string(),startTick:tick,releaseTick:tick,finishTick:tick,
 phase:z.enum(['preparing','channeling','recovering']),escrow:z.number().int().nonnegative(),cooldownTicks:tick,
}).strict();
export const weaponOrderSchema=z.object({id:z.number().int().positive(),binding:z.string(),ability:abilityId,rank:z.number().int().min(1).max(10),target:z.number().int().positive(),owner:z.string().regex(/^(none|player\.[1-8])$/),profile:abilityId,started:tick}).strict();
export const abilityStateSchema=z.object({
 weaponOrder:weaponOrderSchema.optional(),
 mana:z.number().int().nonnegative().max(1_000_000),
 regeneration:z.number().int().nonnegative().max(39999),
 ranks:z.record(z.string(),z.number().int().min(0).max(10)),
 autocast:z.record(z.string(),z.boolean()).optional(),
 cooldowns:z.record(abilityId,tick),pending:pendingAbilitySchema.nullable(),
}).strict();
export type AbilityState=z.infer<typeof abilityStateSchema>;
export type PendingAbility=z.infer<typeof pendingAbilitySchema>;

const point=z.object({x:z.number().finite().min(-128).max(8192),y:z.number().finite().min(-128).max(8192)}).strict();
const deliveryPoint=point.extend({height:z.number().finite().min(-4096).max(8192)});
/** Immutable ownership/classification context for delayed and detached spell work. */
export const spellSourceSchema=z.object({
 height:z.number().finite().min(-4096).max(8192).optional(),locomotion:locomotionSchema.optional(),source:z.number().int().positive(),definition:abilityId,
 owner:z.string().regex(/^(none|player\.[1-8])$/),position:z.object({x:z.number().min(0).max(4096),y:z.number().min(0).max(4096)}).strict(),
 camp:z.string().min(1).max(160).optional(),level:z.number().int().min(0).max(1000000),summoned:z.boolean(),
 resources:z.object({hp:z.number().min(0).max(1000000),maxHp:z.number().min(0).max(1000000),mana:z.number().min(0).max(1000000),maxMana:z.number().min(0).max(1000000)}).strict().refine(r=>r.hp<=r.maxHp&&r.mana<=r.maxMana,'Resource snapshot exceeds capacity').optional(),
}).strict();
export type SpellSource=z.infer<typeof spellSourceSchema>;
export const UNTIL_DEATH=Number.MAX_SAFE_INTEGER;
export const spellStatusSchema=z.object({sourceContext:spellSourceSchema.optional(),owner:z.string(),ability:abilityId,status:z.string().max(48),source:z.number().int().positive(),cast:z.number().int().positive(),rank:z.number().int().min(1).max(10),started:tick,expires:tick,nextTick:tick,shield:z.number().int().min(0).max(1_000_000).optional(),blockedControls:z.array(controlKindSchema).max(7).refine(a=>new Set(a).size===a.length).optional(),aura:z.boolean()}).strict();
export const swarmSeekerSchema=z.object({group:z.number().int().positive(),index:z.number().int().min(0).max(31),launchTick:tick,expires:tick,phase:z.enum(['waiting','seeking','returning']),hits:z.number().int().min(0).max(32),health:z.number().int().min(0).max(1000000),mana:z.number().int().min(0).max(1000000)}).strict();
export const spellDeliverySchema=z.object({swarm:swarmSeekerSchema.optional(),sourceContext:spellSourceSchema.optional(),cast:z.number().int().positive(),ability:abilityId,rank:z.number().int().min(1).max(10),source:z.number().int().positive(),owner:z.string(),target:z.number().int().nonnegative(),origin:deliveryPoint,position:deliveryPoint,point:deliveryPoint,started:tick,nextTick:tick,hit:z.array(z.number().int().positive()).max(128),power:z.number().int().min(0).max(1000)}).strict();
export const summonedSchema=z.object({splitOperation:z.string().min(1).max(48).optional(),sourceLink:z.object({owner:z.string().regex(/^(none|player\.[1-8])$/),camp:z.string().min(1).max(160).optional()}).strict().optional(),reanimatedFrom:z.number().int().positive().optional(),source:z.number().int().positive(),ability:abilityId,rank:z.number().int().min(1).max(10),cast:z.number().int().positive(),started:tick,expires:tick}).strict();
export type SpellStatus=z.infer<typeof spellStatusSchema>;
export type SpellDelivery=z.infer<typeof spellDeliverySchema>;

export const spellInstanceSchema=z.object({sourceContext:spellSourceSchema.optional(),cast:z.number().int().positive(),ability:abilityId,rank:z.number().int().min(1).max(10),source:z.number().int().positive(),owner:z.string(),target:z.number().int().nonnegative(),point,origin:point,started:tick,nextTick:tick,expires:tick}).strict();
export type SpellInstance=z.infer<typeof spellInstanceSchema>;

export const spellVisionSchema=z.object({id:z.number().int().positive(),cast:z.number().int().positive(),ability:abilityId,rank:z.number().int().min(1).max(10),operation:z.string().max(48),source:z.number().int().positive(),owner:z.string(),point,radius:z.number().min(1).max(64),ignoreTerrain:z.boolean(),detectInvisible:z.boolean().default(false),endsWithCaster:z.boolean(),started:tick,expires:tick}).strict();
export type SpellVision=z.infer<typeof spellVisionSchema>;

/** Lifecycle programs retain their origin and event point after entities leave the world. */
export const lifecycleReactionSchema=spellSourceSchema.extend({
 event:z.enum(['interval','death','kill','weaponRelease']),timerGrant:z.number().int().positive().optional(),timerStarted:tick.optional(),weapon:z.enum(['melee','projectile','siege']).optional(),subject:z.object({id:z.number().int().positive(),x:z.number().min(0).max(4096),y:z.number().min(0).max(4096)}).strict(),
 cast:z.number().int().positive(),ability:abilityId,rank:z.number().int().min(1).max(10),trigger:z.string().min(1).max(48),
 tick,viewers:z.array(z.string().regex(/^player\.[1-8]$/)).max(8).refine(a=>new Set(a).size===a.length),
}).strict();
export type LifecycleReaction=z.infer<typeof lifecycleReactionSchema>;

export const splitFormSchema=z.object({owner:z.string().regex(/^(none|player\.[1-8])$/),camp:z.string().min(1).max(160).optional(),ability:abilityId,operation:z.string().min(1).max(48),rank:z.number().int().min(1).max(10),cast:z.number().int().positive(),started:tick,expires:tick,members:z.array(z.number().int().positive()).min(2).max(8).refine(a=>new Set(a).size===a.length)}).strict();
export type SplitForm=z.infer<typeof splitFormSchema>;
export const containmentSchema=z.object({host:z.number().int().positive(),owner:z.string().regex(/^(none|player\.[1-8])$/),ability:abilityId,operation:z.string().min(1).max(48),rank:z.number().int().min(1).max(10),cast:z.number().int().positive(),started:tick,expires:tick,nextTick:tick}).strict();
export type Containment=z.infer<typeof containmentSchema>;
export const heroReturnSchema=z.object({ability:abilityId,operation:z.string().min(1).max(48),rank:z.number().int().min(1).max(10),cast:z.number().int().positive(),owner:z.string().regex(/^(none|player\.[1-8])$/),started:tick,due:tick,deadline:tick}).strict();
export type HeroReturn=z.infer<typeof heroReturnSchema>;
export const triggerCooldownSchema=z.record(z.string().max(220),z.object({rank:z.number().int().min(1).max(10),started:tick,expires:tick}).strict()).refine(v=>Object.keys(v).length<=128);

export const triggerTimerSchema=z.record(z.string().max(220),z.object({rank:z.number().int().min(1).max(10),owner:z.string().regex(/^(none|player\.[1-8])$/),started:tick,nextTick:tick,grant:z.number().int().positive().optional()}).strict()).refine(v=>Object.keys(v).length<=128);
