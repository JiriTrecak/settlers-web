import {z} from 'zod';
/** Classification is targeting metadata, not a change to movement, armor or ownership. */
export const locomotionSchema=z.enum(['ground','air']);
export const unitNatureSchema=z.enum(['organic','undead','mechanical']);
export type UnitNature=z.infer<typeof unitNatureSchema>;
export const targetFilterSchema=z.object({
 locomotion:z.array(locomotionSchema).min(1).max(2).refine(a=>new Set(a).size===a.length,'Duplicate locomotion class').optional(),
 heroes:z.boolean().optional(),summoned:z.boolean().optional(),
 natures:z.array(unitNatureSchema).min(1).max(3).refine(a=>new Set(a).size===a.length,'Duplicate unit nature').optional(),
 minLevel:z.number().int().min(0).max(1_000_000).optional(),maxLevel:z.number().int().min(0).max(1_000_000).optional(),
}).strict().refine(f=>f.minLevel===undefined||f.maxLevel===undefined||f.minLevel<=f.maxLevel,'Minimum level exceeds maximum');
export type TargetTraits={hp?:number;maxHp?:number;mana?:number;maxMana?:number;owner?:string;hero?:boolean;summoned?:boolean;level?:number;nature?:UnitNature;locomotion?:z.infer<typeof locomotionSchema>};
export function matchesTargetFilter(t:TargetTraits,f?:z.infer<typeof targetFilterSchema>){
 return !f||((!f.locomotion||!!t.locomotion&&f.locomotion.includes(t.locomotion))&&(f.heroes===undefined||!!t.hero===f.heroes)&&(f.summoned===undefined||!!t.summoned===f.summoned)&&(!f.natures||!!t.nature&&f.natures.includes(t.nature))&&(f.minLevel===undefined||(t.level??1)>=f.minLevel)&&(f.maxLevel===undefined||(t.level??1)<=f.maxLevel));
}
const leaf=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('resource'),of:z.enum(['target','caster']),resource:z.enum(['health','mana']),measure:z.enum(['current','missing','fractionPermille']),comparison:z.enum(['lt','lte','eq','gte','gt']),value:z.number().int().min(0).max(1_000_000)}).strict(),
 z.object({kind:z.literal('controller'),of:z.enum(['target','caster']),is:z.enum(['player','neutral'])}).strict(),
 z.object({kind:z.literal('relation'),of:z.literal('target'),to:z.literal('caster'),is:z.enum(['ally','enemy'])}).strict(),
 z.object({kind:z.literal('matches'),of:z.enum(['target','caster']),relations:z.array(z.enum(['ally','enemy'])).min(1).max(2).optional(),filter:targetFilterSchema}).strict(),
]);
export const abilityConditionSchema=z.discriminatedUnion('kind',[
 ...leaf.options,
 z.object({kind:z.literal('all'),conditions:z.array(leaf).min(1).max(8)}).strict(),
 z.object({kind:z.literal('any'),conditions:z.array(leaf).min(1).max(8)}).strict(),
]);
export type ConditionContext={relation:string;caster:TargetTraits;target:TargetTraits};
export function matchesAbilityCondition(condition:z.infer<typeof abilityConditionSchema>,context:ConditionContext):boolean{
 if(condition.kind==='resource'){
  const actor=context[condition.of],current=condition.resource==='health'?actor.hp:actor.mana,maximum=condition.resource==='health'?actor.maxHp:actor.maxMana;
  // Missing observations are unknown, never implicitly full or empty resources.
  if(current===undefined||!Number.isFinite(current)||current<0)return false;
  if(condition.measure!=='current'&&(maximum===undefined||!Number.isFinite(maximum)||maximum<=0))return false;
  const left=condition.measure==='current'?current:condition.measure==='missing'?Math.max(0,maximum!-current):current*1000;
  const right=condition.measure==='fractionPermille'?condition.value*maximum!:condition.value;
  return condition.comparison==='lt'?left<right:condition.comparison==='lte'?left<=right:condition.comparison==='eq'?left===right:condition.comparison==='gte'?left>=right:left>right;
 }
 if(condition.kind==='controller')return condition.is==='neutral'?context[condition.of].owner==='none':!!context[condition.of].owner&&context[condition.of].owner!=='none';
 if(condition.kind==='relation')return condition.is===context.relation;
 if(condition.kind==='matches')return (!condition.relations||condition.relations.includes((condition.of==='caster'?'ally':context.relation) as 'ally'|'enemy'))&&matchesTargetFilter(context[condition.of],condition.filter);
 return condition.kind==='all'?condition.conditions.every(c=>matchesAbilityCondition(c,context)):condition.conditions.some(c=>matchesAbilityCondition(c,context));
}
