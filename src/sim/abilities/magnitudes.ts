import {value,type Effect} from '../../content/abilities/schema';
export type ResourceActor={hp:number;maxHp:number;mana?:number;maxMana?:number};
export type EffectResult={applied:number;count:number;health:number;maxHealth:number;mana:number;maxMana:number};
export type EffectResults=Map<string,EffectResult>;
const bounded=(n:number)=>Math.max(0,Math.min(1_000_000,Math.floor(n)));
export function resourceStats(a:ResourceActor|undefined){
 const health=bounded(a?.hp??0),maxHealth=bounded(a?.maxHp??0),mana=bounded(a?.mana??0),maxMana=bounded(a?.maxMana??0);
 return {health,maxHealth,missingHealth:Math.max(0,maxHealth-health),mana,maxMana,missingMana:Math.max(0,maxMana-mana)};
}
/** One bounded numeric expression; no callbacks, arbitrary arithmetic or persistent variables. */
export function effectMagnitude(e:Effect,rank:Record<string,number>,context:{caster?:ResourceActor;target?:ResourceActor;recipient?:ResourceActor;results:EffectResults}){
 const scale='scale' in e?e.scale:undefined;
 const base=scale?(scale.source==='result'?context.results.get(scale.id)?.[scale.stat]??0:resourceStats(context[scale.source])[scale.stat]):0;
 return bounded(value(e.amount,rank)+Math.floor(base*(scale?value(scale.permille,rank):0)/1000));
}
/** Failed/immune/skipped recipients contribute nothing, including no resource snapshots. */
export function recordEffect(results:EffectResults,e:Effect,before:ResourceActor|undefined,applied:number){
 if(!('record' in e)||!e.record||applied<=0)return;
 const old=results.get(e.record)??{applied:0,count:0,health:0,maxHealth:0,mana:0,maxMana:0},r=resourceStats(before);
 results.set(e.record,{applied:bounded(old.applied+applied),count:old.count+1,health:bounded(old.health+r.health),maxHealth:bounded(old.maxHealth+r.maxHealth),mana:bounded(old.mana+r.mana),maxMana:bounded(old.maxMana+r.maxMana)});
}
