import {it,expect} from 'vitest';
import {resolveDamage} from '../../src/sim/game/damage';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {testAbilities} from '../fixtures/content';
import {testSettings,encounterSource} from './encounter-harness';
function fixture(name:string,settings:Record<string,unknown>={}){
 const a=testAbilities.abilities.find(a=>a.id==='ability.test.'+name)!;
 const f=createAbilityEncounter(a,testAbilities.presentations.find(p=>p.id===a.presentation)!,testSettings({relationship:'enemy',targetHealth:500,distance:3,...settings}),false,encounterSource());
 return {...f,a,cast:()=>f.game.abilities.cast(f.caster,'preview',a.targeting.kind==='point'?{x:123,y:120}:a.targeting.kind==='self'?f.caster:f.target),c:()=>f.game.context.get(f.caster)!,t:()=>f.game.context.get(f.target)!};
}
function advance(f:ReturnType<typeof fixture>,n:number){for(let i=0;i<n;i++)f.game.tick(undefined,{passiveUnits:true});}
it('Flame Strike remains at its cast point after caster movement and death',()=>{
 const f=fixture('flame-strike');f.cast();advance(f,12);expect(f.t().hp).toBe(480);
 f.c().x=150;f.c().hp=0;f.game.onCombatDeath(f.c());advance(f,41);
 expect(f.t().hp).toBe(460);expect(f.game.state.spellInstances).toHaveLength(1);
 advance(f,300);expect(f.game.state.spellInstances).toHaveLength(0);
});
it('Immolation follows its caster, charges upkeep and stops before an unaffordable pulse',()=>{
 const f=fixture('immolation',{mana:25});f.cast();advance(f,12);expect(f.t().hp).toBe(480);
 advance(f,40);expect(f.t().hp).toBe(460);expect(f.c().abilities!.mana).toBe(0);
 advance(f,40);expect(f.t().hp).toBe(460);expect(f.game.state.spellInstances).toHaveLength(0);
 const g=fixture('immolation');g.cast();advance(g,12);g.c().x=145;advance(g,40);expect(g.t().hp).toBe(480);
 expect(g.cast()).toBeNull();expect(g.game.state.spellInstances).toHaveLength(0);
});
it('Life Drain heals only actual health loss and breaks its tether',()=>{
 const f=fixture('life-drain');f.c().hp=200;f.cast();advance(f,52);
 expect(f.c().hp).toBe(230);expect(f.t().hp).toBe(470);
 f.t().x=145;advance(f,40);expect(f.c().abilities!.pending).toBeNull();expect(f.c().hp).toBe(230);
});
it('Mana Burn uses available mana, not the authored maximum, for damage',()=>{
 const f=fixture('mana-burn');
 const target=f.game.context.create({id:'mage',definition:'unit.test.marshal',owner:'player.2',position:{x:123,y:120},rotation:270});
 target.abilities!.mana=17;const hp=target.hp!;
 expect(f.game.abilities.cast(f.caster,'preview',target.id)).toBeNull();advance(f,12);
 expect(target.abilities!.mana).toBe(0);expect(target.hp).toBe(hp-resolveDamage(f.game.registry.rules,{armor:f.game.context.stats(target).armor,armorType:f.game.context.def(target).body!.armorType},17,'spell'));
 expect(f.game.abilities.drainEvents().find(e=>e.event==='drained')?.amount).toBe(17);
});
it('Mana Shield spends only available mana and immediately clears on toggle off',()=>{
 const f=fixture('mana-shield',{mana:40});f.cast();advance(f,12);
 const hit=()=>f.game.combat.abilityHit({source:f.target,target:f.caster,damage:60,damageType:'spell'});
 expect(hit().damage).toBe(20);expect(f.c().abilities!.mana).toBe(0);
 expect(f.cast()).toBeNull();expect(f.c().spellStatuses).toBeUndefined();expect(f.game.state.spellInstances).toHaveLength(0);
});
it.each(['flame-strike','immolation','lightning-shield','life-drain','siphon-mana','tranquility','mana-shield'])('%s clocks replay across save/load',name=>{
 const settings={relationship:name==='lightning-shield'?'ally':'enemy'};
 const a=fixture(name,settings),b=fixture(name,settings);a.cast();advance(a,52);b.game.restore(a.game.snapshot());
 for(let i=0;i<100;i++){advance(a,1);advance(b,1);expect(a.game.checksum()).toBe(b.game.checksum());}
});
it('a persistent ground field slows and damages only ground enemies standing inside it, and survives its caster',()=>{
 const f=fixture('briar-patch',{mana:1000}),g=f.game,slow=f.a.onRelease.find(o=>o.op==='status')!;if(slow.op!=='status')throw Error('fixture');
 const ally=g.context.create({id:'ally',definition:'unit.test.warrior',owner:'player.1',position:{x:123,y:122},rotation:0});
 const air=g.context.create({id:'air',definition:'unit.test.winglancer',owner:'player.2',position:{x:123,y:121},rotation:0});
 const hp={target:f.t().hp!,ally:ally.hp,air:air.hp};
 expect(f.cast()).toBeNull();advance(f,12);
 expect(g.context.stats(f.t()).moveSpeedPermille).toBe(1000+(slow.modifiers!.moveSpeedPermille as number));expect(f.t().hp).toBeLessThan(hp.target);
 expect(ally.hp).toBe(hp.ally);expect(air.hp).toBe(hp.air);expect(g.context.stats(air).moveSpeedPermille).toBe(1000);
 const afterFirst=f.t().hp!;f.c().hp=0;g.onCombatDeath(f.c());advance(f,21);expect(f.t().hp).toBeLessThan(afterFirst);expect(g.state.spellInstances).toHaveLength(1);
 f.t().x=150;f.t().unit!.position=null;advance(f,25);expect(g.context.stats(f.t()).moveSpeedPermille).toBe(1000);
 advance(f,240);expect(g.state.spellInstances).toHaveLength(0);
});
