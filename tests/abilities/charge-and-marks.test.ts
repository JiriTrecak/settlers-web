import {expect,it} from 'vitest';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {markedWeaponBonus} from '../../src/sim/abilities/combatModifiers';
import {resolveDamage} from '../../src/sim/game/damage';
import {precise} from '../../src/sim/game/motion';
import {snapPlacement} from '../../src/shared/spatial/placement';
import {isStunned} from '../../src/sim/game/effects';
import {SpellStatuses} from '../../src/sim/abilities/statuses';
import {abilitySchema,releaseEffects} from '../../src/content/abilities/schema';
import {testAbilities,testSource} from '../fixtures/content';

const revalidateAtRelease=['caster','target','range','visibility','relationship'];
const freeCast={prepareTicks:0,recoverTicks:0,cost:{resource:'mana',amount:0,commit:'release'},cooldown:{ticks:0,start:'release',scope:'ability'},cancelBeforeRelease:'refund',revalidateAtRelease};
const self={kind:'self',alive:true,visible:true,relations:['ally'],allowSelf:true,range:0,outOfRange:'reject'};
const base={schemaVersion:1,description:''};
/** Rank tables are the specification; expectations below are derived from them. */
const MARK=[{bonus:5,slow:-50},{bonus:10,slow:-70},{bonus:15,slow:-100}],MARK_TICKS=240,MAX_STACKS=3;
const CHARGE=[{damage:70,stun:30},{damage:115,stun:40},{damage:160,stun:50}];
const REGEN=[{regen:1},{regen:2},{regen:3}];
const GROWTH=[{duration:720,health:300},{duration:960,health:500}];
const spells={
 /** Passive: each melee weapon hit marks the victim (per source, capped stacks); later hits gain a bonus per stack. */
 marks:abilitySchema.parse({...base,id:'ability.test.stacking-mark',name:'Stacking mark',activation:'passive',
  combatModifiers:{attackBonus:{status:'pressure',amount:0,manaCost:0,weapon:'melee',blockedBySilence:false}},ranks:MARK,targeting:self,cast:freeCast,
  statuses:[{op:'status',target:'target',id:'pressure',amount:MARK_TICKS,polarity:'negative',dispel:true,stacking:{max:MAX_STACKS,scope:'source'},sourceAttackBonus:{rankParameter:'bonus'},modifiers:{},rankedModifiers:{moveSpeedPermille:{rankParameter:'slow'}},lifetime:'duration'}],
  onRelease:[],presentation:'presentation.test.hornbreaker-overwhelm'}),
 /** Targeted charge delivery: the caster travels to the target, then damages and stuns it. */
 charge:abilitySchema.parse({...base,id:'ability.test.charge',name:'Charge',activation:'targeted',delivery:{kind:'charge',speed:32,maxTicks:80},ranks:CHARGE,
  targeting:{filter:{locomotion:['ground']},kind:'unit',alive:true,visible:true,relations:['enemy'],allowSelf:false,range:20,outOfRange:'reject'},
  cast:{...freeCast,prepareTicks:8,recoverTicks:8,cost:{resource:'mana',amount:55,commit:'release'}},
  onRelease:[{op:'damage',target:'target',amount:{rankParameter:'damage'},damageType:'spell'},{op:'status',target:'target',id:'impact',amount:{rankParameter:'stun'},polarity:'negative',dispel:true,modifiers:{},stun:true,lifetime:'duration'}],
  presentation:'presentation.test.hornbreaker-horn-rush'}),
 /** Passive aura granting allied health regeneration while its source lives. */
 aura:abilitySchema.parse({...base,id:'ability.test.regen-aura',name:'Regen aura',activation:'passive',aura:{radius:16,meleeOnly:false},ranks:REGEN,targeting:self,cast:freeCast,
  onRelease:[{op:'status',target:'target',id:'steadfast',amount:1,polarity:'positive',dispel:false,modifiers:{},rankedModifiers:{healthRegenPerSecond:{rankParameter:'regen'}},lifetime:'duration'}],
  presentation:'presentation.test.hornbreaker-steadfast'}),
 /** Timed self form adding max health and cleave, without changing the body. */
 growth:abilitySchema.parse({...base,id:'ability.test.growth-form',name:'Growth form',activation:'targeted',ranks:GROWTH,targeting:self,
  cast:{...freeCast,prepareTicks:12,recoverTicks:8,cost:{resource:'mana',amount:100,commit:'release'}},
  onRelease:[{op:'status',target:'caster',id:'form',amount:{rankParameter:'duration'},polarity:'positive',dispel:false,combatModifiers:{cleave:{damagePermille:350,radius:6,arcDegrees:110,maxTargets:6,includeBuildings:false}},modifiers:{},rankedModifiers:{maxHp:{rankParameter:'health'}},form:{opacity:1,scale:1.35},lifetime:'duration'},{op:'heal',target:'caster',amount:{rankParameter:'health'}}],
  presentation:'presentation.test.hornbreaker-colossus'}),
};
type Name=keyof typeof spells;
const step=(g:ReturnType<typeof fixture>['game'],n:number)=>{for(let i=0;i<n;i++)g.tick();};
function fixture(name:Name,rank=1,settings:Record<string,unknown>={}){
 const spell=spells[name];
 const f=createAbilityEncounter(spell,testAbilities.presentations.find(p=>p.id===spell.presentation)!,encounterSettingsSchema.parse({casterDefinition:'unit.test.warrior',targetDefinition:'unit.test.warrior',relationship:'enemy',targetHealth:3000,mana:1000,distance:12,...settings}),false,testSource());
 const c=f.game.context.get(f.caster)!,t=f.game.context.get(f.target)!;c.abilities!.ranks.preview=rank;
 return {...f,c,t,spell,cast:()=>f.game.command('player.1',{type:'castAbility',actor:c.id,binding:'preview',target:{kind:'unit',entity:spell.targeting.kind==='self'?c.id:t.id}})};
}
function strike(f:ReturnType<typeof fixture>,a=f.c,b=f.t){
 const u=a.unit!,tick=f.game.state.tick,cycle=f.game.context.stats(a).cooldownTicks;
 u.target=b.id;u.order={type:'attack',target:b.id,force:false};u.attack={profile:f.game.context.weaponDefinition(a),target:b.id,cycleTicks:cycle,started:tick,impact:tick,ends:tick+10,released:false};
 f.game.combat.resolve();
}
it.each([1,2,3])('stacking marks rank %i ramp only subsequent hits, cap stacks, slow per stack and expire',rank=>{
 const f=fixture('marks',rank,{distance:3,combat:true}),base=f.game.context.stats(f.c).damage,type=f.game.context.def(f.c).behaviors.combat!.damageType,{bonus,slow}=MARK[rank-1];
 const damage=(raw:number)=>resolveDamage(f.game.registry.rules,{armorType:f.game.context.def(f.t).body!.armorType,armor:f.game.context.stats(f.t).armor},raw,type);
 for(let hit=0;hit<5;hit++){
  const before=f.t.hp!;strike(f);expect(before-f.t.hp!).toBe(damage(base+Math.min(MAX_STACKS,hit)*bonus));
  expect(f.t.spellStatuses?.find(s=>s.status==='pressure')?.stacks).toBe(Math.min(MAX_STACKS,hit+1));
  expect(f.game.context.stats(f.t).moveSpeedPermille).toBe(1000+Math.min(MAX_STACKS,hit+1)*slow);
 }
 f.c.unit!.order={type:'hold'};f.c.unit!.target=null;delete f.c.unit!.attack;f.c.x=100;f.c.unit!.position=null;f.game.context.spatial.updateUnitMovement(f.c);
 step(f.game,MARK_TICKS+1);expect(f.t.spellStatuses).toBeUndefined();expect(markedWeaponBonus(f.c,f.t,f.game.registry,f.game.state.tick)).toBe(0);
});
it('marks are source/target specific; ally weapons, spells and misses cannot add stacks',()=>{
 const f=fixture('marks',3,{distance:3,combat:true});strike(f);
 const ally=f.game.context.create({id:'ally',definition:'unit.test.warrior',owner:'player.1',position:{x:122,y:122},rotation:0});
 expect(markedWeaponBonus(ally,f.t,f.game.registry,0)).toBe(0);
 f.game.combat.abilityHit({source:f.c.id,target:f.t.id,damage:20,damageType:'spell'});expect(f.t.spellStatuses![0].stacks).toBe(1);
 f.t.x=140;f.t.unit!.position=null;strike(f);expect(f.t.spellStatuses![0].stacks).toBe(1);
 const other=f.game.context.create({id:'other',definition:'unit.test.warrior',owner:'player.2',position:{x:123,y:120},rotation:0});expect(markedWeaponBonus(f.c,other,f.game.registry,0)).toBe(0);
});
it.each([1,2,3])('a charge (rank %i) physically travels before contact, then damages and stuns',rank=>{
 const f=fixture('charge',rank),before=precise(f.c),hp=f.t.hp!;expect(f.cast().accepted).toBe(true);
 step(f.game,12);expect(f.t.hp).toBe(hp);expect(precise(f.c).x).toBeGreaterThan(before.x);expect(precise(f.c).x).toBeLessThan(f.t.x);
 step(f.game,18);expect(f.t.hp).toBe(hp-CHARGE[rank-1].damage);expect(isStunned(f.t,f.game.registry)).toBe(true);expect(f.game.state.spellDeliveries).toHaveLength(0);
 expect(f.game.context.spatial.bodyRange(f.c,f.t)).toBeLessThanOrEqual(.65**2);
});
it('a charge stops on a unit obstruction and cancels without damage on a new order',()=>{
 const blocked=fixture('charge');const hp=blocked.t.hp;const blocker=blocked.game.context.create({id:'block',definition:'unit.test.warrior',owner:'player.1',position:{x:126,y:120},rotation:0});blocker.unit!.order={type:'hold'};blocked.cast();step(blocked.game,60);expect(blocked.t.hp).toBe(hp);expect(precise(blocked.c).x).toBeLessThan(126);expect(blocked.game.state.spellDeliveries).toHaveLength(0);
 const f=fixture('charge'),before=f.t.hp;f.cast();step(f.game,12);expect(f.game.command('player.1',{type:'stop',actors:[f.c.id]}).accepted).toBe(true);step(f.game,80);expect(f.t.hp).toBe(before);expect(f.game.state.spellDeliveries).toHaveLength(0);
});
it.each([1,2,3])('a regeneration aura (rank %i) reaches allies and ends with source death',rank=>{
 const f=fixture('aura',rank,{relationship:'ally'});step(f.game,1);expect(f.game.context.stats(f.t).healthRegenPerSecond).toBe(REGEN[rank-1].regen);
 f.c.hp=0;step(f.game,2);expect(f.game.context.stats(f.t).healthRegenPerSecond).toBe(0);
});
it.each([1,2])('a growth form (rank %i) grants max health without changing collision, then reverts',rank=>{
 const f=fixture('growth',rank),before=f.game.context.stats(f.c),radius=f.game.context.def(f.c).dimensions?.radius;
 f.cast();step(f.game,25);expect(f.game.context.stats(f.c).maxHp).toBe(before.maxHp+GROWTH[rank-1].health);expect(f.game.context.def(f.c).dimensions?.radius).toBe(radius);
 expect(f.c.spellStatuses?.find(s=>s.status==='form')).toBeTruthy();step(f.game,GROWTH[rank-1].duration);expect(f.game.context.stats(f.c).maxHp).toBe(before.maxHp);
});
it.each(['charge','marks','aura','growth'] as const)('%s restores and continues deterministically',name=>{
 const a=fixture(name),b=fixture(name);if(name==='marks'){a.t.x=123;a.t.unit!.position=null;strike(a);}else if(a.spell.activation!=='passive')a.cast();step(a.game,12);
 b.game.restore(JSON.parse(JSON.stringify(a.game.snapshot())));for(let i=0;i<160;i++){a.game.tick();b.game.tick();expect(a.game.checksum('full')).toBe(b.game.checksum('full'));}
});
it('independent sources retain separate marks without multiplying the named slow',()=>{
 const f=fixture('marks',3,{distance:3,combat:true});
 f.t.hp=3000;
 const other=f.game.context.create({id:'other-hero',definition:'unit.preview.caster',owner:'player.1',position:{x:123,y:122},rotation:0});other.abilities!.ranks.preview=3;other.readyTick=0;
 for(let i=0;i<3;i++){f.t.hp=500;strike(f);strike(f,other);}
 expect(f.t.spellStatuses!.filter(s=>s.status==='pressure')).toHaveLength(2);
 const full=MAX_STACKS*MARK[2].bonus;expect(markedWeaponBonus(f.c,f.t,f.game.registry,0)).toBe(full);expect(markedWeaponBonus(other,f.t,f.game.registry,0)).toBe(full);
 expect(f.game.context.stats(f.t).moveSpeedPermille).toBe(1000+MAX_STACKS*MARK[2].slow);
 other.owner='player.2';expect(markedWeaponBonus(other,f.t,f.game.registry,0)).toBe(0);
});
it('charge cancellation respects building obstructions and target death',()=>{
 const f=fixture('charge');f.cast();step(f.game,12);f.t.hp=0;step(f.game,1);expect(f.game.state.spellDeliveries).toHaveLength(0);
 const wall=fixture('charge'),hp=wall.t.hp;
 wall.game.context.create({id:'wall',definition:'building.test.house',owner:'player.1',position:snapPlacement(wall.game.registry.get('building.test.house'),{x:126,y:120}),rotation:0});wall.game.context.spatial.rebuild();wall.game.observation.update();
 const result=wall.cast();if(result.accepted)step(wall.game,80);expect(wall.t.hp).toBe(hp);expect(precise(wall.c).x).toBeLessThan(126);
});
it('root interrupts an in-flight charge and duplicate saved charges are rejected atomically',()=>{
 const f=fixture('charge');f.cast();step(f.game,12);
 const saved=f.game.snapshot(),hash=f.game.checksum();
 saved.state.spellDeliveries.push({...structuredClone(saved.state.spellDeliveries[0]),cast:saved.state.nextCast++});
 expect(()=>f.game.restore(saved)).toThrow(/spell/);expect(f.game.checksum()).toBe(hash);
 const before=precise(f.c),hp=f.t.hp,roots=testAbilities.abilities.find(a=>a.id==='ability.test.entangling-roots')!;
 new SpellStatuses(f.game).apply(f.t.id,f.c.id,roots,1,f.game.state.nextCast++,releaseEffects(roots,1,'enemy')[0]);
 step(f.game,4);expect(precise(f.c)).toEqual(before);expect(f.t.hp).toBe(hp);expect(f.game.state.spellDeliveries).toHaveLength(0);
});
