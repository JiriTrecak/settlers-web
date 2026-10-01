import {z} from 'zod';
import {abilityId} from '../../content/abilities/schema';
const tick=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const pendingAbilitySchema=z.object({
 id:z.number().int().positive(),binding:z.string(),ability:abilityId,rank:z.number().int().min(1).max(10),
 target:z.number().int().nonnegative(),point:z.object({x:z.number().int().nonnegative().max(4096),y:z.number().int().nonnegative().max(4096)}).strict().optional(),
 channel:z.object({wave:z.number().int().min(0).max(32),nextWaveTick:tick,endTick:tick,origin:z.object({x:z.number(),y:z.number()}).strict()}).strict().optional(),owner:z.string(),startTick:tick,releaseTick:tick,finishTick:tick,
 phase:z.enum(['preparing','channeling','recovering']),escrow:z.number().int().nonnegative(),cooldownTicks:tick,
}).strict();
export const abilityStateSchema=z.object({
 mana:z.number().int().nonnegative().max(1_000_000),
 regeneration:z.number().int().nonnegative().max(39999),
 ranks:z.record(z.string(),z.number().int().min(0).max(10)),
 autocast:z.record(z.string(),z.boolean()).optional(),
 cooldowns:z.record(abilityId,tick),pending:pendingAbilitySchema.nullable(),
}).strict();
export type AbilityState=z.infer<typeof abilityStateSchema>;
export type PendingAbility=z.infer<typeof pendingAbilitySchema>;

const point=z.object({x:z.number().finite().min(-128).max(8192),y:z.number().finite().min(-128).max(8192)}).strict();
export const spellStatusSchema=z.object({owner:z.string(),ability:abilityId,status:z.string().max(48),source:z.number().int().positive(),cast:z.number().int().positive(),rank:z.number().int().min(1).max(10),started:tick,expires:tick,nextTick:tick,aura:z.boolean()}).strict();
export const spellDeliverySchema=z.object({cast:z.number().int().positive(),ability:abilityId,rank:z.number().int().min(1).max(10),source:z.number().int().positive(),owner:z.string(),target:z.number().int().nonnegative(),origin:point,position:point,point,started:tick,nextTick:tick,hit:z.array(z.number().int().positive()).max(128),power:z.number().int().min(0).max(1000)}).strict();
export const summonedSchema=z.object({source:z.number().int().positive(),ability:abilityId,expires:tick}).strict();
export type SpellStatus=z.infer<typeof spellStatusSchema>;
export type SpellDelivery=z.infer<typeof spellDeliverySchema>;
