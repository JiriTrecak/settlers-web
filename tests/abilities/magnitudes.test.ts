import {expect,it} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {abilitySchema,resolveEffect,type Effect} from '../../src/content/abilities/schema';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {effectMagnitude} from '../../src/sim/abilities/magnitudes';
import {SpellStatuses} from '../../src/sim/abilities/statuses';
import {abilityAimScore} from '../../src/sim/abilities/ai';
const base=coreAbilities.abilities.find(a=>a.id==='ability.core.holy-light')!;
const heal={op:'heal',target:'target',amount:0,scale:{source:'recipient',stat:'maxHealth',permille:{rankParameter:'factor'}}};
function fixture(ops:unknown[]=[heal],settings={},patch={}){
 const a=abilitySchema.parse({...base,ranks:[{factor:500}],targeting:{...base.targeting,condition:undefined,filter:undefined,relations:['ally','enemy'],allowSelf:false,range:20},cast:{...base.cast,prepareTicks:0,recoverTicks:0,cost:{...base.cast.cost,amount:0},cooldown:{...base.cast.cooldown,ticks:0}},onRelease:ops,...patch}),p=coreAbilities.presentations.find(p=>p.id===a.presentation)!,f=createAbilityEncounter(a,p,encounterSettingsSchema.parse({relationship:'ally',targetHealth:40,mana:100,...settings}));
 const c=f.game.context.get(f.caster)!,t=f.game.context.get(f.target)!;c.hp=100;return {...f,a,p,c,t};
}
function cast(f:ReturnType<typeof fixture>){expect(f.game.abilities.cast(f.caster,'preview',f.target)).toBeNull();}
function step(f:ReturnType<typeof fixture>,n=3){for(let i=0;i<n;i++)f.game.tick();}
const sacrifice={op:'sacrifice',target:'target',amount:1,record:'offering'};
const reward=(op='heal',stat='maxHealth')=>({op,target:'caster',amount:0,scale:{source:'result',id:'offering',stat,permille:{rankParameter:'factor'}}});
it('resolves ranked percentages plus base and rounds down at one bounded numeric boundary',()=>{
 const f=fixture([{...heal,amount:3}]);cast(f);step(f);expect(f.t.hp).toBe(293);
 const e={...heal,amount:2,scale:{source:'recipient',stat:'missingHealth',permille:333}} as Extract<Effect,{op:'heal'}>;
 expect(effectMagnitude(e,{}, {recipient:{hp:11,maxHp:100},results:new Map()})).toBe(31);
 expect(effectMagnitude({...e,amount:999999,scale:{source:'recipient',stat:'maxHealth',permille:10000}}, {},{recipient:{hp:100,maxHp:1000000},results:new Map()})).toBe(1000000);
});
it('distinguishes the primary aim, each queried recipient and the caster snapshot',()=>{
 const query={center:'target',radius:5,relations:['ally'],allowSelf:false,maxTargets:8};
 for(const source of ['target','recipient','caster']){const f=fixture([{op:'heal',target:'target',query,amount:0,scale:{source,stat:'health',permille:1000}}],{targetCount:2,distance:8});const second=f.game.entities.find(e=>e.id!==f.caster&&e.id!==f.target)!;second.hp=90;
 cast(f);step(f);expect(f.t.hp).toBe(40+(source==='caster'?100:40));expect(second.hp).toBe(90+(source==='target'?40:source==='caster'?100:90));}
});
it('records actual post-mitigation damage and caps overkill before a later caster heal',()=>{
 const f=fixture([{op:'damage',target:'target',amount:500,damageType:'spell',record:'offering'},reward('heal','applied')],{relationship:'enemy',targetHealth:40});cast(f);step(f);
 expect(f.game.context.get(f.target)).toBeUndefined();expect(f.c.hp).toBe(120);expect(f.game.abilities.observedEvents().find(e=>e.event==='healed')?.amount).toBe(20);
});
it('full absorption records no health, capacity or successful recipient count',()=>{
 for(const stat of ['applied','health','maxHealth','count']){const f=fixture([{op:'damage',target:'target',amount:20,damageType:'spell',record:'offering'},reward('heal',stat)],{relationship:'enemy'});
 const a=coreAbilities.abilities.find(a=>a.id==='ability.core.absorption-shield')!;new SpellStatuses(f.game).apply(f.target,f.target,a,1,f.game.state.nextCast++,a.onRelease[0] as any);cast(f);step(f);expect(f.c.hp).toBe(100);expect(f.t.hp).toBe(40);}
});
it('aggregates queried results once and keeps results local to each release',()=>{
 const query={center:'target',radius:5,relations:['enemy'],maxTargets:8};
 const f=fixture([{op:'damage',target:'target',query,amount:10,damageType:'spell',record:'offering'},reward('heal','applied')],{relationship:'enemy',targetCount:3,targetHealth:100});cast(f);step(f);expect(f.c.hp).toBe(115);
 f.c.hp=100;for(const t of f.game.entities.filter(e=>e.id!==f.caster))f.game.context.remove(t);
 f.game.abilities.invoke(f.caster,f.caster,f.a,1,f.a.onRelease);expect(f.c.hp).toBe(100);
});
it('a missing branch result yields zero instead of leaking a previous branch or cast',()=>{
 const f=fixture([{op:'branch',condition:{kind:'relation',of:'target',to:'caster',is:'enemy'},then:[{op:'damage',target:'target',amount:20,damageType:'spell',record:'offering'}],else:[{op:'heal',target:'target',amount:1}]},reward('heal','applied')]);cast(f);step(f);expect(f.c.hp).toBe(100);expect(f.t.hp).toBe(41);
});
it('sacrifices an owned non-hero and converts its saved capacity after normal death cleanup',()=>{
 const f=fixture([sacrifice,reward()]);cast(f);step(f);expect(f.game.context.get(f.target)).toBeUndefined();expect(f.c.hp).toBe(350);expect(f.game.state.corpses.some(c=>c.id===f.target)).toBe(true);
 expect(f.game.abilities.observedEvents().some(e=>e.event==='sacrificed')).toBe(true);
});
it('sacrifice bypasses damage protection but still respects spell immunity and ownership',()=>{
 const f=fixture([sacrifice,reward()]);const ward=coreAbilities.abilities.find(a=>a.id==='ability.core.anti-magic-shell')!;new SpellStatuses(f.game).apply(f.target,f.target,ward,1,f.game.state.nextCast++,ward.onRelease[0] as any);cast(f);step(f);expect(f.c.hp).toBe(350);
 for(const settings of [{relationship:'enemy'},{targetHero:true}]){const g=fixture([sacrifice,reward()],settings);expect(g.game.abilities.cast(g.caster,'preview',g.target)).toMatch(/Sacrifice/);}
 const g=fixture([sacrifice,reward()]);g.t.owner='player.3';g.game.abilities.invoke(g.caster,g.target,g.a,1,g.a.onRelease);expect(g.t.hp).toBe(40);expect(g.c.hp).toBe(100);
});
it('interrupted sacrifice refunds escrow and cannot restore anything when its target is lost',()=>{
 const f=fixture([sacrifice,reward()],{}, {cast:{...base.cast,prepareTicks:8,recoverTicks:0,cost:{...base.cast.cost,amount:20},cooldown:{...base.cast.cooldown,ticks:0}}});cast(f);expect(f.c.abilities!.mana).toBe(80);f.game.context.remove(f.t);step(f,12);expect(f.c.hp).toBe(100);expect(f.c.abilities!.mana).toBe(100);
});
it('resource scaling and result restoration respect actual mana capacity and available amounts',()=>{
 const f=fixture([sacrifice,reward('mana')]);cast(f);step(f);expect(f.c.abilities!.mana).toBe(350);
 const g=fixture([{op:'mana',target:'caster',amount:0,scale:{source:'caster',stat:'missingMana',permille:500},record:'offering'},reward('heal','applied')]);cast(g);step(g);expect(g.c.abilities!.mana).toBe(550);expect(g.c.hp).toBe(325);
});
it('recipient percentages update each channel wave and results reset between waves',()=>{
 const f=fixture([{op:'damage',target:'target',amount:0,damageType:'spell',scale:{source:'recipient',stat:'health',permille:500}}],{relationship:'enemy',targetHealth:200},{cast:{...base.cast,prepareTicks:0,recoverTicks:0,channel:{waves:2,intervalTicks:4},cost:{...base.cast.cost,amount:0},cooldown:{...base.cast.cooldown,ticks:0}}});cast(f);step(f,12);expect(f.t.hp).toBe(50);
});
it('same cast commands, mid-preparation restore and detached boosted sources replay identically',()=>{
 const patch={delivery:{kind:'projectile',speed:5},cast:{...base.cast,prepareTicks:8,recoverTicks:0,cost:{...base.cast.cost,amount:0},cooldown:{...base.cast.cooldown,ticks:0}}};
 const f=fixture([{op:'damage',target:'target',amount:0,damageType:'spell',scale:{source:'caster',stat:'maxHealth',permille:200}}],{relationship:'enemy',targetHealth:500},patch),g=fixture(f.a.onRelease,{relationship:'enemy',targetHealth:500},patch);
 const avatar=coreAbilities.abilities.find(a=>a.id==='ability.core.avatar')!,op=avatar.onRelease[0];if(op.op!=='status')throw Error();
 for(const h of [f,g]){new SpellStatuses(h.game).apply(h.caster,h.caster,avatar,1,h.game.state.nextCast++,resolveEffect(op,1,avatar.ranks[0]));expect(h.game.context.stats(h.c).maxHp).toBe(800);expect(h.game.command('player.1',{type:'castAbility',actor:h.caster,binding:'preview',target:{kind:'unit',entity:h.target}}).accepted).toBe(true);}
 step(f);step(g);g.game.restore(f.game.snapshot());
 for(let i=0;i<7;i++){step(f,1);step(g,1);expect(g.game.checksum()).toBe(f.game.checksum());}
 f.c.hp=0;g.game.context.get(g.caster)!.hp=0;f.game.onCombatDeath(f.c);g.game.onCombatDeath(g.game.context.get(g.caster)!);g.game.restore(f.game.snapshot());
 for(let i=0;i<100;i++){step(f,1);step(g,1);expect(g.game.checksum()).toBe(f.game.checksum());}expect(f.t.hp).toBe(340);
});
it('rejects missing/forward/duplicate result references, invalid rank scales and point primary stats',()=>{
 for(const ops of [[reward()],[reward(),sacrifice],[sacrifice,sacrifice],[{...heal,scale:{source:'recipient',stat:'health',permille:10001}}],[{...heal,scale:{source:'recipient',stat:'health',permille:{rankParameter:'absent'}}}]])expect(()=>fixture(ops)).toThrow();
 expect(()=>fixture([heal],{}, {targeting:{...base.targeting,kind:'point',radius:5},onRelease:[{...heal,scale:{source:'target',stat:'maxHealth',permille:100}}]})).toThrow(/Point/);
});
it('AI evaluates sacrifice cost and result reward on copies of visible actors',()=>{
 const f=fixture([sacrifice,reward()]);const c={id:1,x:0,y:0,owner:'player.1',hp:100,maxHp:500,alive:true,targetable:true,unit:true},t={...c,id:2,x:2,hp:40};
 const before=JSON.stringify([c,t]);expect(abilityAimScore(f.a,1,c,t,[c,t],()=> 'ally','wounded-ally')).toBeGreaterThan(0);
 expect(abilityAimScore(f.a,1,{...c,hp:500},t,[{...c,hp:500},t],()=> 'ally','wounded-ally')).toBeLessThanOrEqual(0);expect(JSON.stringify([c,t])).toBe(before);
});
it('a protected or already consumed unit cannot yield a second sacrifice reward',()=>{
 const ward={op:'status',id:'ward',target:'target',amount:100,polarity:'positive',dispel:true,modifiers:{},spellImmunity:'all'};
 const f=fixture([sacrifice,reward()],{}, {statuses:[ward]});
 new SpellStatuses(f.game).apply(f.caster,f.target,f.a,1,f.game.state.nextCast++,resolveEffect(f.a.statuses![0],1,f.a.ranks[0]));
 f.game.abilities.invoke(f.caster,f.target,f.a,1,f.a.onRelease);expect(f.t.hp).toBe(40);expect(f.c.hp).toBe(100);expect(f.game.abilities.cast(f.caster,'preview',f.target)).not.toBeNull();
 const g=fixture([sacrifice,reward()]);cast(g);step(g);const hp=g.c.hp;
 g.game.abilities.invoke(g.caster,g.target,g.a,1,g.a.onRelease);expect(g.c.hp).toBe(hp);
});
it('rejects forged saved resource capacities without changing authoritative state',()=>{
 const f=fixture([{op:'damage',target:'target',amount:0,damageType:'spell',scale:{source:'caster',stat:'maxHealth',permille:200}}],{relationship:'enemy',targetHealth:500},{delivery:{kind:'projectile',speed:5}});cast(f);step(f);
 const before=f.game.checksum();
 for(const corruption of ['capacity','resources','context']){const saved=f.game.snapshot(),delivery=saved.state.spellDeliveries[0];
 if(corruption==='capacity')delivery.sourceContext!.resources!.hp=1000001;else if(corruption==='resources')delete delivery.sourceContext!.resources;else delete delivery.sourceContext;
 expect(()=>f.game.restore(saved)).toThrow();expect(f.game.checksum()).toBe(before);}
});
it('neutral sacrifices stay inside the source camp despite sharing the none owner',()=>{
 const f=fixture([sacrifice,reward()]);f.c.owner=f.t.owner='none';f.c.unit!.camp='camp-a';f.t.unit!.camp='camp-b';
 f.game.abilities.invoke(f.caster,f.target,f.a,1,f.a.onRelease);expect(f.t.hp).toBe(40);expect(f.c.hp).toBe(100);
 f.t.unit!.camp='camp-a';f.game.abilities.invoke(f.caster,f.target,f.a,1,f.a.onRelease);expect(f.game.context.get(f.target)).toBeUndefined();expect(f.c.hp).toBe(350);
});
