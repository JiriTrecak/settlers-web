import {expect,it} from 'vitest';
import {game,placed,type source} from '../game/helpers';
import type {AuthoredDefinition} from '../../src/content/schema';

type Draft=ReturnType<typeof source>;
const BONUS=150,RADIUS=16,DURATION=480;
/** Self-cast area buff: allied units within RADIUS gain BONUS‰ damage for DURATION ticks; autocast when enemies are near. */
const rally={schemaVersion:1,id:'ability.test.area-buff',name:'Area buff',description:'Buffs nearby allied units.',activation:'targeted',
 autocast:{intervalTicks:16,enabledByDefault:true},ranks:[{}],
 targeting:{kind:'self',alive:true,visible:true,relations:['ally'],allowSelf:true,range:0,outOfRange:'reject'},
 cast:{prepareTicks:16,recoverTicks:16,cost:{resource:'mana',amount:40,commit:'release'},cooldown:{ticks:800,start:'release',scope:'ability'},cancelBeforeRelease:'refund',revalidateAtRelease:['caster','target','range','visibility','relationship']},
 onRelease:[{op:'status',target:'target',query:{center:'caster',radius:RADIUS,relations:['ally'],allowSelf:true,includeBuildings:false,excludePrimary:false,maxTargets:128,order:'nearest'},
  id:'rallied',amount:DURATION,polarity:'positive',dispel:true,modifiers:{},rankedModifiers:{damagePermille:BONUS},lifetime:'duration'}],
 presentation:'presentation.test.rallying-standard'};
function withBuffer(draft:Draft){
 const defs=draft.definitions as AuthoredDefinition[],d=structuredClone(defs.find(d=>d.id==='unit.test.warrior')!);
 d.id='unit.test.buffer';d.behaviors={...d.behaviors,abilities:{maxMana:120,manaRegenPerSecond:0,bindings:[{id:'rally',ability:rally.id,initialRank:1,controls:['player','ai','scenario'],command:{hotkey:'Q',column:1},ai:{preference:'enemy',intervalTicks:16}}]} as never};
 defs.push(d);const library=draft.abilityLibrary as {abilities:unknown[]};library.abilities=[...library.abilities,rally];
}
const rallied=(e:{spellStatuses?:{status:string}[]})=>e.spellStatuses?.some(s=>s.status==='rallied')??false;
function fixture(){
 const g=game([placed('buffer','unit.test.buffer',215,230),placed('second','unit.test.buffer',214,235),placed('ally','unit.test.warrior',223,230),placed('far','unit.test.warrior',240,250),placed('building','building.test.house',225,240),{...placed('enemy','unit.test.warrior',225,230),owner:'player.2'}],withBuffer);
 const get=(id:string)=>g.entities.find(e=>e.placement===id)!;return{g,get};
}
const step=(g:ReturnType<typeof game>,n:number)=>{for(let i=0;i<n;i++)g.tick(undefined,{passiveUnits:true});};
it('a self-cast area status reaches allied units in radius only, excluding buildings, enemies and distant units',()=>{
 const {g,get}=fixture(),a=get('ally'),base=g.context.stats(a).damage;
 expect(Math.hypot(get('far').x-get('buffer').x,get('far').y-get('buffer').y)).toBeGreaterThan(RADIUS);
 expect(g.abilities.cast(get('buffer').id,'rally',get('buffer').id)).toBeNull();step(g,20);
 expect(g.context.stats(a).damage).toBeCloseTo(base*(1+BONUS/1000),6);expect(rallied(get('buffer'))).toBe(true);
 for(const id of ['enemy','far','building'])expect(rallied(get(id))).toBe(false);
});
it('the same status from a second source refreshes without stacking and expires deterministically',()=>{
 const {g,get}=fixture(),a=get('ally'),base=g.context.stats(a).damage;
 g.abilities.cast(get('buffer').id,'rally',get('buffer').id);step(g,20);
 g.abilities.cast(get('second').id,'rally',get('second').id);step(g,20);
 expect(a.spellStatuses?.filter(s=>s.status==='rallied')).toHaveLength(1);expect(g.context.stats(a).damage).toBeCloseTo(base*(1+BONUS/1000),6);
 const other=fixture().g;other.restore(g.snapshot());for(let i=0;i<DURATION+20;i++){g.tick(undefined,{passiveUnits:true});other.tick(undefined,{passiveUnits:true});}
 expect(g.context.stats(a).damage).toBe(base);expect(g.checksum()).toBe(other.checksum());
});
it('autocast holds a self buff until enemies are near',()=>{
 const g=game([placed('buffer','unit.test.buffer',215,230),placed('ally','unit.test.warrior',218,235)],withBuffer),b=g.entities.find(e=>e.placement==='buffer')!;b.unit!.order={type:'hold'};
 for(let i=0;i<80;i++)g.tick();expect(b.spellStatuses?.length??0).toBe(0);
 const e=g.context.create({...placed('enemy','unit.test.warrior',235,230),owner:'player.2'});e.unit!.order={type:'hold'};
 let fired=false;for(let i=0;i<100;i++){g.tick();fired ||= rallied(b);}expect(fired).toBe(true);
});
