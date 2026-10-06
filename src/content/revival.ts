import type {Definition} from './schema';
export type RevivalPolicy = NonNullable<Definition['behaviors']['revival']>;
/** Level one pays the base; subsequent levels add the declared increments.
 * The accepted level is frozen on a funded queue entry. */
export function revivalTerms(policy:RevivalPolicy,level:number) {
 const amount=new Map<string,number>();
 for(const p of policy.items)amount.set(p.item,(amount.get(p.item)??0)+p.amount);
 for(const p of policy.itemsPerLevel)amount.set(p.item,(amount.get(p.item)??0)+p.amount*(level-1));
 return {items:[...amount].filter(([,n])=>n>0).map(([item,amount])=>({item,amount})),workTicks:policy.workTicks+policy.workTicksPerLevel*(level-1)};
}
