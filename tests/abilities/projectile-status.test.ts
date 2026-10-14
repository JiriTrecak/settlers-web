import {expect,it} from 'vitest';
import {game,placed,type source} from '../game/helpers';
import {spellControl} from '../../src/sim/abilities/statuses';
import type {AuthoredDefinition} from '../../src/content/schema';

type Draft=ReturnType<typeof source>;
const revalidateAtRelease=['caster','target','range','visibility','relationship'];
/** A projectile that silences an enemy with mana on impact: 120 ticks, 60 on heroes. */
const silence={schemaVersion:1,id:'ability.test.projectile-silence',name:'Projectile silence',description:'Silences an enemy caster on impact.',activation:'targeted',
 delivery:{kind:'projectile',speed:32},autocast:{intervalTicks:12,enabledByDefault:true},ranks:[{}],
 targeting:{condition:{kind:'resource',of:'target',resource:'mana',measure:'current',comparison:'gt',value:0},kind:'unit',alive:true,visible:true,relations:['enemy'],allowSelf:false,range:20,outOfRange:'reject'},
 cast:{prepareTicks:10,recoverTicks:8,cost:{resource:'mana',amount:35,commit:'release'},cooldown:{ticks:400,start:'release',scope:'ability'},cancelBeforeRelease:'refund',revalidateAtRelease},
 onRelease:[{op:'status',target:'target',id:'sealed',amount:120,heroDuration:60,polarity:'negative',dispel:true,modifiers:{},silence:true,lifetime:'duration'}],
 presentation:'presentation.test.amber-seal'};
/** A plain self buff, so silenced targets have something to (fail to) cast. */
const ward={schemaVersion:1,id:'ability.test.self-ward',name:'Self ward',description:'A short self buff.',activation:'targeted',ranks:[{}],
 targeting:{kind:'self',alive:true,visible:true,relations:['ally'],allowSelf:true,range:0,outOfRange:'reject'},
 cast:{prepareTicks:4,recoverTicks:4,cost:{resource:'mana',amount:10,commit:'release'},cooldown:{ticks:0,start:'release',scope:'ability'},cancelBeforeRelease:'refund',revalidateAtRelease},
 onRelease:[{op:'status',target:'target',id:'warded',amount:40,polarity:'positive',dispel:true,modifiers:{},lifetime:'duration'}],
 presentation:'presentation.test.rallying-standard'};
const binding=(id:string,ability:string,hotkey:string)=>({id,ability,initialRank:1,controls:['player','ai','scenario'],command:{hotkey,column:1},ai:{preference:'enemy',intervalTicks:12}});
function withCasters(draft:Draft){
 const defs=draft.definitions as AuthoredDefinition[],warrior=defs.find(d=>d.id==='unit.test.warrior')!;
 const unit=(id:string,bindings:unknown[],hero=false)=>{const d=structuredClone(warrior);d.id=id;if(hero)d.hero=true;d.behaviors={...d.behaviors,abilities:{maxMana:200,manaRegenPerSecond:0,bindings} as never};defs.push(d);};
 unit('unit.test.silencer',[binding('silence',silence.id,'Q')]);
 unit('unit.test.enemy-caster',[binding('ward',ward.id,'W')]);
 unit('unit.test.enemy-hero',[binding('ward',ward.id,'W')],true);
 const library=draft.abilityLibrary as {abilities:unknown[]};library.abilities=[...library.abilities,silence,ward];
}
function fixture(hero=false){
 const g=game([placed('caster','unit.test.silencer',215,230),{...placed('target',hero?'unit.test.enemy-hero':'unit.test.enemy-caster',228,230),owner:'player.2'},{...placed('soldier','unit.test.warrior',231,230),owner:'player.2'}],withCasters);
 const get=(id:string)=>g.entities.find(e=>e.placement===id)!;return {g,c:get('caster'),t:get('target'),soldier:get('soldier')};
}
function advance(g:ReturnType<typeof game>,n:number){for(let i=0;i<n;i++)g.tick(undefined,{passiveUnits:true});}
function untilFlight(g:ReturnType<typeof game>){for(let i=0;i<40&&!g.state.spellDeliveries.length;i++)advance(g,1);expect(g.state.spellDeliveries).toHaveLength(1);}
const sealed=(e:{spellStatuses?:{status:string;started:number;expires:number}[]})=>e.spellStatuses?.find(s=>s.status==='sealed');

it('applies a projectile-carried status on impact, silences casting but not weapons, and expires after its duration',()=>{
 const {g,c,t}=fixture(),hp=t.hp;
 expect(g.abilities.cast(c.id,'silence',t.id)).toBeNull();untilFlight(g);
 expect(spellControl(t,g.registry,'silence')).toBe(false);
 let landed=false;for(let i=0;i<40;i++){advance(g,1);if(spellControl(t,g.registry,'silence')){landed=true;break;}}
 expect(landed).toBe(true);expect(g.state.spellDeliveries).toHaveLength(0);expect(t.hp).toBe(hp);expect(spellControl(t,g.registry,'disarm')).toBe(false);
 const s=sealed(t)!;expect(s.expires-s.started).toBe(120);
 expect(g.abilities.cast(t.id,'ward',t.id)).not.toBeNull();
 advance(g,121);expect(spellControl(t,g.registry,'silence')).toBe(false);expect(g.abilities.cast(t.id,'ward',t.id)).toBeNull();
});
it('uses the declared hero duration on heroes and rejects targets failing the mana condition before spending',()=>{
 const {g,c,t,soldier}=fixture(true),mana=c.abilities!.mana;
 expect(g.abilities.cast(c.id,'silence',soldier.id)).not.toBeNull();expect(c.abilities!.mana).toBe(mana);expect(c.abilities!.pending).toBeNull();
 expect(g.abilities.cast(c.id,'silence',t.id)).toBeNull();advance(g,40);
 const s=sealed(t)!;expect(s.expires-s.started).toBe(60);
});
it('autocast picks a nearby enemy caster',()=>{
 const {g,t}=fixture();for(const e of g.entities)if(e.unit)e.unit.order={type:'hold'};
 let hit=false;for(let i=0;i<100;i++){g.tick();hit ||= spellControl(t,g.registry,'silence');}expect(hit).toBe(true);
});
