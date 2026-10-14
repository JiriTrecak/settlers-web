import {expect,it} from 'vitest';
import {abilitySchema,type Effect} from '../../src/content/abilities/schema';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {abilityAimScore} from '../../src/sim/abilities/ai';
import {testAbilities} from '../fixtures/content';
import {testSettings,encounterSource,runLockstep} from './encounter-harness';

const convert:Effect={op:'convert',target:'target',amount:1,supply:'allow-over-cap'};
const sacrifice:Effect={op:'sacrifice',target:'target',amount:1,record:'offering'};
const heal:Effect={op:'heal',target:'caster',amount:100};
function fixture(name:string,onRelease:unknown[],settings={}){
 const base=testAbilities.abilities.find(a=>a.id==='ability.test.'+name)!;
 const a=abilitySchema.parse({...base,onRelease}),p=testAbilities.presentations.find(p=>p.id===base.presentation)!;
 return {...createAbilityEncounter(a,p,testSettings({relationship:'enemy',distance:6,mana:1000,casterHealth:100,targetHealth:500,...settings}),false,encounterSource()),a};
}
function tick(f:ReturnType<typeof fixture>,count=1){for(let i=0;i<count;i++)f.game.tick(undefined,{passiveUnits:true});}

it.each([false,true])('converts before checking owned sacrifice, including within a branch (%s)',branch=>{
 const payload=branch?[{op:'branch',condition:{kind:'relation',of:'target',to:'caster',is:'enemy'},then:[convert,sacrifice],else:[{op:'heal',target:'target',amount:1}]}]:[convert,sacrifice];
 const ops=[...payload,{op:'heal',target:'caster',amount:0,scale:{source:'result',id:'offering',stat:'maxHealth',permille:1000}}];
 const f=fixture('charm',ops),copy=fixture('charm',ops);
 const victim=f.game.context.get(f.target!)!;
 expect(f.game.abilities.cast(f.caster,'preview',f.target!)).toBeNull();tick(f,2);
 copy.game.restore(JSON.parse(JSON.stringify(f.game.snapshot())));
 for(let n=0;n<40;n++){tick(f);tick(copy);expect(f.game.checksum()).toBe(copy.game.checksum());}
 expect(victim.owner).toBe('player.1');expect(victim.hp).toBe(0);
 expect(f.game.context.get(f.caster)!.hp).toBe(500);
 expect(f.game.abilities.observedEvents().filter(e=>['converted','sacrificed','healed'].includes(e.event)).map(e=>e.event)).toEqual(['converted','sacrificed','healed']);
});
it('rejects an invalid first world operation without spending mana',()=>{
 const f=fixture('charm',[sacrifice,heal]);
 expect(f.game.abilities.cast(f.caster,'preview',f.target!)).toMatch(/owned/);
 expect(f.game.context.get(f.caster)!.abilities!.mana).toBe(1000);expect(f.game.context.get(f.caster)!.hp).toBe(100);
});
it('keeps an earlier successful effect when a later world operation fails its live validation',()=>{
 const f=fixture('charm',[heal,sacrifice]);
 expect(f.game.abilities.cast(f.caster,'preview',f.target!)).toBeNull();tick(f,40);
 expect(f.game.context.get(f.caster)!.hp).toBe(200);expect(f.game.context.get(f.target!)!.hp).toBe(500);
 expect(f.game.abilities.observedEvents().some(e=>e.event==='sacrificed')).toBe(false);
});
it('uses the current flight form when landing a later teleport above blocked ground',()=>{
 const blink=testAbilities.abilities.find(a=>a.id==='ability.test.blink')!.onRelease[0];
 const f=fixture('blink',[{op:'status',id:'flight',target:'caster',amount:200,polarity:'positive',dispel:true,form:{movement:{locomotion:'air',flightHeight:7}}},blink]);
 for(let y=124;y<=132;y++)for(let x=124;x<=132;x++)f.game.spatial.terrain[y*256+x]=0;f.game.spatial.rebuild();
 expect(f.game.abilities.cast(f.caster,'preview',{x:128,y:128})).toBeNull();tick(f,30);
 const caster=f.game.context.get(f.caster)!;
 expect(f.game.spatial.airborne(caster)).toBe(true);expect(caster).toMatchObject({x:128,y:128});
 expect(f.game.abilities.observedEvents().find(e=>e.event==='teleported')?.amount).toBe(1);
});

it.each([false,true])('predicts conversion before sacrifice and keeps the branch decision (%s)',branch=>{
 const effects=branch?[{op:'branch',condition:{kind:'relation',of:'target',to:'caster',is:'enemy'},then:[convert,sacrifice],else:[{op:'heal',target:'target',amount:1}]}]:[convert,sacrifice];
 const {a}=fixture('charm',[...effects,{op:'heal',target:'caster',amount:0,scale:{source:'result',id:'offering',stat:'maxHealth',permille:1000}}]);
 const caster={id:1,x:0,y:0,hp:100,maxHp:500,alive:true,targetable:true,unit:true,owner:'player.1'},target={...caster,id:2,x:6,hp:200,owner:'player.2'};
 const observed=[caster,target],before=structuredClone(observed);
 // The game relation adapter reads authoritative IDs; prediction must override it locally.
 expect(abilityAimScore(a,1,caster,target,observed,t=>t.id===2?'enemy':'ally','enemy')).toBe(1600);
 expect(observed).toEqual(before);
});
it('queries predicted allies after conversion',()=>{
 const {a}=fixture('charm',[convert, {op:'heal',target:'target',amount:10,query:{center:'target',radius:2,relations:['ally'],allowSelf:false,includeBuildings:false,excludePrimary:false,maxTargets:8,order:'nearest'}}]);
 const caster={id:1,x:0,y:0,hp:500,maxHp:500,alive:true,targetable:true,unit:true,owner:'player.1'},target={...caster,id:2,x:6,hp:200,owner:'player.2'};
 expect(abilityAimScore(a,1,caster,target,[caster,target],t=>t.id===2?'enemy':'ally','enemy')).toBe(1410);
});

it('runs conversion then sacrifice through delayed two-peer commands and a pending-cast restore',()=>{
 const f=fixture('charm',[convert,sacrifice,{op:'heal',target:'caster',amount:0,scale:{source:'result',id:'offering',stat:'maxHealth',permille:1000}}]);
 const events=new Map<number,string>();
 const leader=runLockstep(f.game,{type:'castAbility',actor:f.caster,binding:'preview',target:{kind:'unit',entity:f.target!}},40,{restoreAt:[3,18],onTick:(_,world)=>{
  for(const e of world.settlement.abilities.observedEvents())if(e.ability===f.a.id&&['converted','sacrificed','healed'].includes(e.event))events.set(e.id,e.event);
 }});
 expect([...events.values()]).toEqual(['converted','sacrificed','healed']);expect(leader.settlement.context.get(f.caster)!.hp).toBeGreaterThanOrEqual(500);
});
