import {expect,it} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {abilitySchema,releaseEffects} from '../../src/content/abilities/schema';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {SpellStatuses} from '../../src/sim/abilities/statuses';
import {resolveDamage} from '../../src/sim/game/damage';
import type {Entity} from '../../src/sim/game/state';
import {combatModifiers,criticalStrike,evadeWeapon} from '../../src/sim/abilities/combatModifiers';
const spell=(id:string)=>coreAbilities.abilities.find(a=>a.id==='ability.core.'+id)!;
function fixture(id='critical-strike',settings:Record<string,unknown>={},patch={}){
 const a=abilitySchema.parse({...spell(id),...patch});
 const f=createAbilityEncounter(a,coreAbilities.presentations.find(p=>p.id===a.presentation)!,encounterSettingsSchema.parse({combat:true,distance:3,relationship:'enemy',targetHealth:500,...settings}));
 return {...f,a,c:f.game.context.get(f.caster)!,t:f.game.context.get(f.target)!};
}
function strike(f:ReturnType<typeof fixture>,a=f.c,b=f.t){
 const u=a.unit!,tick=f.game.state.tick,cycle=f.game.context.stats(a).cooldownTicks;
 u.target=b.id;u.order={type:'attack',target:b.id,force:false};u.attack={profile:f.game.context.weaponDefinition(a),target:b.id,cycleTicks:cycle,started:tick,impact:tick,ends:tick+10,released:false};
 return f.game.combat.resolve();
}
function expected(f:ReturnType<typeof fixture>,raw:number,t=f.t,type='melee'){
 return resolveDamage(f.game.registry.rules,{armorType:f.game.context.def(t).body!.armorType,armor:f.game.context.stats(t).armor},raw,type);
}
function apply(f:ReturnType<typeof fixture>,id:string,target:Entity){const a=spell(id);for(const op of releaseEffects(a,1,'ally'))new SpellStatuses(f.game).apply(target.id,target.id,a,1,f.game.state.nextCast++,op);}
it('critical strikes modify one melee hit before armor, not an extra spell-damage proc',()=>{
 const f=fixture('critical-strike',{}, {combatModifiers:{critical:{chancePermille:1000,multiplierPermille:2000}}});
 const raw=f.game.context.stats(f.c).damage;strike(f);expect(f.t.hp).toBe(500-expected(f,raw*2));
 expect(f.game.combat.spellEvents).toHaveLength(1);expect(f.game.combat.spellEvents[0]).toMatchObject({weapon:true,melee:true,damage:expected(f,raw*2)});
 expect(f.game.abilities.observedEvents()).toContainEqual(expect.objectContaining({ability:f.a.id,event:'criticalStrike',amount:expected(f,raw*2)}));
});
it('evasion avoids direct melee and arrow hits before consuming shields and never avoids ability or splash damage',()=>{
 const f=fixture('evasion',{}, {combatModifiers:{evasionPermille:1000}});apply(f,'absorption-shield',f.c);
 const shield=f.c.spellStatuses![0].shield;strike(f,f.t,f.c);expect(f.c.hp).toBe(500);expect(f.c.spellStatuses![0].shield).toBe(shield);expect(f.game.combat.spellEvents).toHaveLength(0);
 f.game.combat.resolve([{source:f.target,target:f.caster,damage:50,damageType:'pierce',weapon:true}]);expect(f.c.spellStatuses![0].shield).toBe(shield);
 f.game.combat.resolve([{source:f.target,target:f.caster,damage:20,damageType:'spell'}]);expect(f.c.spellStatuses![0].shield).toBe(shield!-20);
 delete f.c.spellStatuses;expect(f.game.combat.abilityHit({source:f.target,target:f.caster,damage:30,damageType:'spell'}).damage).toBe(30);
 expect(f.game.abilities.observedEvents().filter(e=>e.event==='evaded')).toHaveLength(2);
});
it('cleave uses a capped forward arc, excludes the primary and allies, and creates no secondary weapon hits',()=>{
 const f=fixture('cleaving-attack',{}, {combatModifiers:{cleave:{damagePermille:500,radius:6,arcDegrees:120,maxTargets:1,includeBuildings:false}}});
 const make=(id:string,x:number,y:number,owner:'player.1'|'player.2'='player.2')=>f.game.context.create({id,definition:'unit.ants.warrior',owner,position:{x,y},rotation:270});
 const near=make('near',124,121),far=make('far',125,119),back=make('back',118,120),ally=make('ally',123,119,'player.1');
 const hp=new Map([near,far,back,ally].map(e=>[e.id,e.hp!])),raw=f.game.context.stats(f.c).damage;
 strike(f);expect(near.hp).toBe(hp.get(near.id)!-expected(f,raw*.5,near));for(const e of [far,back,ally])expect(e.hp).toBe(hp.get(e.id));
 expect(f.game.combat.spellEvents.filter(e=>e.weapon)).toHaveLength(1);expect(f.game.combat.spellEvents.find(e=>e.target===near.id)?.weapon).toBe(false);
 expect(f.game.abilities.observedEvents()).toContainEqual(expect.objectContaining({event:'cleaved',target:near.id}));
});
it('a missed or fully absorbed primary hit cannot cleave',()=>{
 const f=fixture('cleaving-attack');const other=f.game.context.create({id:'other',definition:'unit.ants.warrior',owner:'player.2',position:{x:124,y:121},rotation:270}),hp=other.hp;
 apply(f,'absorption-shield',f.t);strike(f);expect(other.hp).toBe(hp);expect(f.game.abilities.observedEvents().some(e=>e.event==='cleaved')).toBe(false);
});
it('critical and cleave compose once and ranged weapons never cleave',()=>{
 const f=fixture('critical-strike',{}, {combatModifiers:{critical:{chancePermille:1000,multiplierPermille:2000},cleave:{damagePermille:500,radius:6,arcDegrees:360,maxTargets:16}}});
 const other=f.game.context.create({id:'other',definition:'unit.ants.warrior',owner:'player.2',position:{x:124,y:121},rotation:270}),hp=other.hp!;
 strike(f);expect(other.hp).toBe(hp-expected(f,f.game.context.stats(f.c).damage,other));
 const arrow=fixture('cleaving-attack',{casterDefinition:'unit.ants.archer',distance:8});strike(arrow);expect(arrow.game.state.missiles).toHaveLength(1);expect(arrow.game.combat.spellEvents).toHaveLength(0);
});
it('released critical arrows retain rolled damage after source death and restore identically in flight',()=>{
 const patch={combatModifiers:{critical:{chancePermille:1000,multiplierPermille:2000}}},settings={casterDefinition:'unit.ants.archer',distance:10};
 const f=fixture('critical-strike',settings,patch);f.game.command('player.2',{type:'hold',actors:[f.target]});
 for(let i=0;i<100&&!f.game.state.missiles.length;i++)f.game.tick();
 const m=f.game.state.missiles[0];expect(m).toMatchObject({criticalAbility:f.a.id,damage:f.game.context.stats(f.c).damage*2});
 const restored=fixture('critical-strike',settings,patch);restored.game.restore(f.game.snapshot());
 f.c.hp=0;restored.game.context.get(restored.caster)!.hp=0;
 while(f.game.state.tick<=m.impact){f.game.tick();restored.game.tick();expect(restored.game.checksum()).toBe(f.game.checksum());}
 expect(f.t.hp).toBe(500-expected(f,m.damage,f.t,m.damageType));
});
it('timed modifier grants expire and deduplicate repeated stacks',()=>{
 const base=spell('holy-light-lite'),a=abilitySchema.parse({...base,onRelease:[{op:'status',target:'target',id:'weaponTraining',amount:40,polarity:'positive',dispel:true,modifiers:{},combatModifiers:{critical:{chancePermille:1000,multiplierPermille:3000},evasionPermille:750}}]});
 const f=fixture('critical-strike',{}, {combatModifiers:{critical:{chancePermille:1000,multiplierPermille:2000},evasionPermille:250}});
 // Use the published library's status grant contract in its own fixture.
 const g=fixture('holy-light-lite',{relationship:'ally'},a);for(const op of releaseEffects(g.a,1,'ally'))new SpellStatuses(g.game).apply(g.caster,g.caster,g.a,1,g.game.state.nextCast++,op);
 g.c.spellStatuses!.push({...g.c.spellStatuses![0]});expect(combatModifiers(g.c,g.game.registry,0)).toHaveLength(1);
 expect(criticalStrike(g.c,g.game.registry,0,g.game.state)?.multiplier).toBe(3000);expect(combatModifiers(g.c,g.game.registry,40)).toHaveLength(0);
 expect(criticalStrike(f.c,f.game.registry,0,f.game.state)?.multiplier).toBe(2000);
});
it('probabilistic modifiers preserve RNG and outcomes across lockstep save/load',()=>{
 const f=fixture('evasion'),g=fixture('evasion');g.game.restore(f.game.snapshot());let avoided=0;
 for(let i=0;i<100;i++){const a=evadeWeapon(f.c,f.game.registry,0,f.game.state),b=evadeWeapon(g.c,g.game.registry,0,g.game.state);expect(a).toBe(b);if(a)avoided++;expect(g.game.checksum()).toBe(f.game.checksum());}
 expect(avoided).toBeGreaterThan(0);expect(avoided).toBeLessThan(100);
});
it('rejects invalid ranked modifier budgets and targeted always-on grants',()=>{
 const a=spell('critical-strike');
 for(const combatModifiers of [{critical:{chancePermille:1001,multiplierPermille:2000}},{critical:{chancePermille:250,multiplierPermille:999}},{evasionPermille:1001},{cleave:{damagePermille:1001,radius:3,arcDegrees:120,maxTargets:16}},{}])expect(abilitySchema.safeParse({...a,combatModifiers}).success).toBe(false);
 expect(abilitySchema.safeParse({...a,activation:'targeted'}).success).toBe(false);
 expect(abilitySchema.safeParse({...a,ranks:[{chance:250,multiplier:20000}]}).success).toBe(false);
});
