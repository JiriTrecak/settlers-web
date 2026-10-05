import {it,expect} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {isStunned} from '../../src/sim/game/effects';
import {itemFlag} from '../../src/sim/game/itemModifiers';
import {spellControl,SpellStatuses} from '../../src/sim/abilities/statuses';
import {releaseEffects} from '../../src/content/abilities/schema';
const names=['storm-bolt','entangling-roots','bloodlust','chain-lightning','shockwave','vampiric-aura','feral-spirit','dispel-magic'];
function setup(name:string,settings:Record<string,unknown>={}){
 const spell=coreAbilities.abilities.find(a=>a.id==='ability.core.'+name)!;
 const look=coreAbilities.presentations.find(p=>p.id===spell.presentation)!;
 const f=createAbilityEncounter(spell,look,encounterSettingsSchema.parse({relationship:'enemy',targetHealth:500,...settings}));
 const {game,caster,target}=f;
 const cast=()=>game.command('player.1',{type:'castAbility',actor:caster,binding:'preview',target:spell.targeting.kind==='point'?{kind:'point',position:{x:126,y:120}}:{kind:'unit',entity:spell.targeting.kind==='self'?caster:target}});
 return {...f,spell,cast,c:()=>game.context.get(caster)!,t:()=>game.context.get(target)!};
}
const advance=(game:ReturnType<typeof setup>['game'],ticks:number)=>{for(let i=0;i<ticks;i++)game.tick();};
it('casting replaces combat pursuit and its movement plan without moving the caster',()=>{
 const f=setup('storm-bolt',{combat:true}),u=f.c().unit!;
 const goal=f.game.spatial.cell(f.t());
 u.target=f.target;u.pursuit={target:f.target,position:{x:f.t().x,y:f.t().y},seenTick:f.game.state.tick};
 u.order={type:'attack',target:f.target,force:false};u.route=[goal];u.goal=goal;
 u.position={x:f.c().x*1000+125,y:f.c().y*1000};
 u.segment={from:{x:f.c().x*1000,y:f.c().y*1000},to:goal,length:6000,progress:125};
 const position={...u.position};
 expect(f.cast().accepted).toBe(true);
 expect(u).toMatchObject({order:null,target:null,route:[],goal:null,segment:null,position});
 expect(u.pursuit).toBeUndefined();expect(u.attack).toBeUndefined();expect(u.detour).toBeUndefined();
});
it('Storm Bolt only damages on projectile impact and interrupts with an expiring stun',()=>{
 const f=setup('storm-bolt');expect(f.cast().accepted).toBe(true);advance(f.game,11);
 expect(f.t().hp).toBe(500);expect(f.game.state.spellDeliveries).toHaveLength(1);
 advance(f.game,16);expect(f.t().hp).toBe(400);expect(isStunned(f.t(),f.game.registry)).toBe(true);
 const duration=f.t().spellStatuses![0].expires-f.game.state.tick;advance(f.game,duration);expect(isStunned(f.t(),f.game.registry)).toBe(false);
});
it('Roots lock movement and attacks, deal periodic damage, but do not stun casting',()=>{
 const f=setup('entangling-roots');f.cast();advance(f.game,11);
 expect(itemFlag(f.t(),f.game.registry,'rooted')).toBe(true);expect(spellControl(f.t(),f.game.registry,'disarm')).toBe(true);expect(isStunned(f.t(),f.game.registry)).toBe(false);
 advance(f.game,40);expect(f.t().hp).toBe(485);
 const before=f.t().x;f.game.command('player.2',{type:'move',actors:[f.target],destination:{x:135,y:120}});advance(f.game,40);expect(f.t().x).toBe(before);
});
it('Bloodlust changes shared movement and attack stats without accumulating on refresh',()=>{
 const f=setup('bloodlust',{relationship:'ally',combat:true});const before=f.game.context.stats(f.t());f.cast();advance(f.game,11);
 const after=f.game.context.stats(f.t());expect(after.moveSpeedPermille).toBe(1250);expect(after.cooldownTicks).toBe(Math.round(before.cooldownTicks/1.4));
 advance(f.game,45);f.cast();advance(f.game,11);expect(f.t().spellStatuses).toHaveLength(1);expect(f.game.context.stats(f.t()).moveSpeedPermille).toBe(1250);
});
it('autocast is an explicit saved command and only buffs targets missing the buff',()=>{
 const f=setup('bloodlust',{relationship:'ally',targetCount:3,mana:1000});expect(f.game.command('player.1',{type:'abilityAutocast',actor:f.caster,binding:'preview',enabled:true}).accepted).toBe(true);
 advance(f.game,220);for(const e of f.game.entities)expect(e.spellStatuses).toHaveLength(1);
 expect(f.c().abilities!.mana).toBe(840);advance(f.game,100);expect(f.c().abilities!.mana).toBe(840);
 expect(f.game.command('player.2',{type:'abilityAutocast',actor:f.caster,binding:'preview',enabled:false}).accepted).toBe(false);
});
it('Chain Lightning makes bounded distinct jumps with diminishing damage',()=>{
 const f=setup('chain-lightning',{targetCount:4,targetSpacing:2});f.cast();advance(f.game,45);
 const hits=f.game.abilities.drainEvents().filter(e=>e.event==='damaged');expect(hits.map(e=>e.amount)).toEqual([85,72,61,52]);expect(new Set(hits.map(e=>e.target)).size).toBe(4);expect(f.game.state.spellDeliveries).toHaveLength(0);
});
it('Shockwave sweeps a line without repeat damage or hitting outside it',()=>{
 const f=setup('shockwave',{targetCount:3,targetSpacing:4});f.cast();advance(f.game,65);
 const hits=f.game.abilities.drainEvents().filter(e=>e.event==='damaged');expect(new Set(hits.map(e=>e.target)).size).toBe(hits.length);expect(f.t().hp).toBe(425);
});
it('Vampiric Aura passively supplies melee lifesteal and removes it outside range',()=>{
 const f=setup('vampiric-aura',{combat:true,relationship:'ally'});advance(f.game,1);
 expect(f.game.context.stats(f.t()).lifestealPermille).toBe(150);
 f.t().x=150;advance(f.game,1);expect(f.game.context.stats(f.t()).lifestealPermille).toBe(0);
 expect(f.cast().accepted).toBe(false);
});
it('Feral Spirit spawns controllable models, replaces the old group, and expires without supply',()=>{
 const f=setup('feral-spirit',{relationship:'self',mana:1000});f.cast();advance(f.game,11);
 const spirits=()=>f.game.entities.filter(e=>e.summoned);
 expect(spirits()).toHaveLength(2);for(const e of spirits()){expect(e.owner).toBe('player.1');expect(f.game.registry.get(e.definition).supplyCost).toBe(0);expect(f.game.command('player.1',{type:'move',actors:[e.id],destination:{x:115,y:120}}).accepted).toBe(true);}
 const old=spirits().map(e=>e.id);f.c().abilities!.cooldowns={};advance(f.game,8);f.cast();advance(f.game,11);expect(spirits()).toHaveLength(2);expect(spirits().some(e=>old.includes(e.id))).toBe(false);
 advance(f.game,2401);expect(spirits()).toHaveLength(0);
});
it('Dispel removes positive and negative statuses and modifiers',()=>{
 const f=setup('dispel-magic',{initialStatuses:['ability.core.bloodlust','ability.core.entangling-roots']});expect(f.t().spellStatuses).toHaveLength(2);f.cast();advance(f.game,11);
 expect(f.t().spellStatuses).toBeUndefined();expect(f.game.context.stats(f.t()).moveSpeedPermille).toBe(1000);expect(itemFlag(f.t(),f.game.registry,'rooted')).toBe(false);
});
it('Dispel damages enemy summons but preserves non-dispellable stuns',()=>{
 const f=setup('dispel-magic');const statuses=new SpellStatuses(f.game);
 const stun=coreAbilities.abilities.find(a=>a.id==='ability.core.storm-bolt')!;
 statuses.apply(f.caster,f.target,stun,1,f.game.state.nextCast++,releaseEffects(stun,1,'enemy')[1]);
 f.t().summoned={source:f.target,ability:'ability.core.feral-spirit',rank:1,cast:1,started:0,expires:9999};
 f.cast();advance(f.game,11);expect(f.t().hp).toBe(300);expect(isStunned(f.t(),f.game.registry)).toBe(true);
});
it.each(names)('%s survives save/restore and lockstep replay',name=>{
 const settings={relationship:name==='bloodlust'||name==='vampiric-aura'?'ally':'enemy',combat:name==='vampiric-aura',targetCount:3};
 const a=setup(name,settings),b=setup(name,settings);if(name!=='vampiric-aura')a.cast();advance(a.game,12);b.game.restore(a.game.snapshot());
 for(let tick=0;tick<80;tick++){a.game.tick();b.game.tick();expect(a.game.checksum()).toBe(b.game.checksum());}
});
it('rejects forged projectile ranks and status expiry without modifying the running game',()=>{
 const f=setup('storm-bolt');f.cast();advance(f.game,12);const saved=f.game.snapshot(),hash=f.game.checksum();saved.state.spellDeliveries[0].rank=10;expect(()=>f.game.restore(saved)).toThrow(/spell/);expect(f.game.checksum()).toBe(hash);
 advance(f.game,15);const next=f.game.snapshot();next.state.entities.find(e=>e.id===f.target)!.spellStatuses![0].expires++;expect(()=>f.game.restore(next)).toThrow(/spell/);
});
it('released projectiles continue after caster death; dead targets fizzle without retargeting',()=>{
 const f=setup('storm-bolt');f.cast();advance(f.game,11);f.c().hp=0;f.game.onCombatDeath(f.c());advance(f.game,30);expect(f.t().hp).toBe(400);expect(isStunned(f.t(),f.game.registry)).toBe(true);
 const g=setup('storm-bolt',{targetCount:2});g.cast();advance(g.game,11);g.t().hp=0;g.game.onCombatDeath(g.t());advance(g.game,30);expect(g.game.state.spellDeliveries).toHaveLength(0);expect(g.game.entities.find(e=>e.id!==g.caster)!.hp).toBe(500);
});
it('Roots complete their final periodic tick and continue after the caster dies',()=>{
 const f=setup('entangling-roots');f.cast();advance(f.game,11);f.c().hp=0;f.game.onCombatDeath(f.c());advance(f.game,359);expect(f.t().hp).toBe(365);expect(f.t().spellStatuses).toBeUndefined();
});
it('stuns interrupt channels immediately and use the shorter hero duration',()=>{
 const f=setup('storm-bolt');const hero=f.game.context.create({id:'hero',definition:'unit.ants.marshal',owner:'player.2',position:{x:126,y:120},rotation:270});
 f.game.observation.update();const channel=f.game.registry.get(hero.definition).behaviors.abilities!.bindings.find(b=>b.ability==='ability.core.blizzard')!;expect(f.game.abilities.cast(hero.id,channel.id,{x:122,y:120})).toBeNull();expect(f.game.command('player.1',{type:'castAbility',actor:f.caster,binding:'preview',target:{kind:'unit',entity:hero.id}}).accepted).toBe(true);
 advance(f.game,30);expect(hero.abilities!.pending).toBeNull();expect(hero.spellStatuses![0].expires-hero.spellStatuses![0].started).toBe(120);
});
it('aura lifesteal only applies to actual ordinary melee damage, never ability hits',()=>{
 const f=setup('vampiric-aura',{combat:true,distance:2});f.c().hp=100;advance(f.game,1);const before=f.c().hp;
 f.game.combat.abilityHit({source:f.caster,target:f.target,damage:50,damageType:'spell'});expect(f.c().hp).toBe(before);
 expect(f.game.command('player.1',{type:'attack',actors:[f.caster],target:f.target}).accepted).toBe(true);
 let healed=false;for(let i=0;i<100;i++){const hp=f.c().hp!;f.game.tick();if(f.c().hp!>hp)healed=true;}
 expect(healed).toBe(true);
});
it('removing an aura source clears recipients and duplicate sources do not stack',()=>{
 const f=setup('vampiric-aura',{combat:true,relationship:'ally'});const second=f.game.context.create({id:'second',definition:'unit.preview.caster',owner:'player.1',position:{x:120,y:124},rotation:90});advance(f.game,1);expect(f.game.context.stats(f.t()).lifestealPermille).toBe(150);
 f.c().hp=0;f.game.onCombatDeath(f.c());advance(f.game,1);expect(f.game.context.stats(f.t()).lifestealPermille).toBe(150);
 second.hp=0;f.game.onCombatDeath(second);advance(f.game,1);expect(f.game.context.stats(f.t()).lifestealPermille).toBe(0);
});
