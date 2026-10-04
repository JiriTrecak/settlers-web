import {describe,it,expect} from 'vitest';
import {builtinSource} from '../../src/content/builtin';
import {ContentRegistry} from '../../src/content/registry';
import {Game} from '../../src/sim/game/game';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import type {Definition} from '../../src/content/schema';
import {abilityLibrarySchema,abilitySchema,releaseEffects,type AbilityLibrary} from '../../src/content/abilities/schema';
import {coreAbilities} from '../../src/content/abilities/core';

function setup(enemy=false,edit?:(library:AbilityLibrary)=>void){
 const source=structuredClone(builtinSource);
 const library=abilityLibrarySchema.parse(source.abilityLibrary);edit?.(library);source.abilityLibrary=library;
 const d=structuredClone(source.definitions.find(d=>(d as Definition).id==='unit.ants.warrior')) as Definition&{disabledBehaviors?:string[]};
 d.id='unit.test.ability-caster';source.definitions.push(d);
 d.behaviors.abilities={maxMana:200,manaRegenPerSecond:0,bindings:[{id:'holy-light',ability:'ability.core.holy-light-lite',initialRank:1,controls:['player','ai'],command:{hotkey:'Q',column:1}}]};
 delete d.behaviors.combat;d.disabledBehaviors=[...(d.disabledBehaviors??[]),'combat'];
 const map={...emptyUtcMap(),sandbox:true,entities:[
  {id:'caster',definition:d.id,owner:'player.1' as const,position:{x:120,y:120},rotation:90},
  {id:'target',definition:d.id,owner:(enemy?'player.2':'player.1') as 'player.1'|'player.2',position:{x:125,y:120},rotation:270},
 ]};
 const game=new Game(map,[{player:0,kind:'human'},{player:1,kind:'human'}],new ContentRegistry(source),42);
 const caster=game.entities.find(e=>e.placement==='caster')!,target=game.entities.find(e=>e.placement==='target')!;
 target.hp=20;game.observation.update();
 return {game,caster,target,cast:()=>game.command('player.1',{type:'castAbility',actor:caster.id,binding:'holy-light',target:{kind:'unit',entity:target.id}})};
}
const run=(game:Game,n:number)=>{for(let i=0;i<n;i++)game.tick();};
describe('declarative ability schema',()=>{
 it('resolves rank parameters and branches without spell-specific dispatch',()=>{
  const a=abilitySchema.parse(coreAbilities.abilities[0]);
  expect(releaseEffects(a,1,'ally')).toEqual([{op:'heal',target:'target',amount:100}]);
  expect(releaseEffects(a,1,'enemy')).toEqual([{op:'damage',target:'target',amount:50,damageType:'spell'}]);
 });
 it('rejects missing parameters, unsupported operations and unsafe bounds',()=>{
  const raw=structuredClone(coreAbilities.abilities[0]);delete raw.ranks[0].heal;expect(abilitySchema.safeParse(raw).success).toBe(false);
  expect(abilitySchema.safeParse({...raw,onRelease:[{op:'javascript',source:'alert(1)'}]}).success).toBe(false);
  expect(abilitySchema.safeParse({...coreAbilities.abilities[0],ranks:[{...coreAbilities.abilities[0].ranks[0],range:5000}]}).success).toBe(false);
 });
 it('includes abilities in frozen registry identity',()=>{
  const a=setup(),b=setup(false,l=>l.abilities[0].ranks[0].heal=99);
  expect(a.game.registry.fingerprint).not.toBe(b.game.registry.fingerprint);
  expect(Object.isFrozen(a.game.registry.abilityLibrary.abilities[0])).toBe(true);
 });
});
describe('Holy Light in real Game simulation',()=>{
 it('escrows mana, heals at release once, starts cooldown at release, then recovers',()=>{
  const {game,caster,target,cast}=setup();
  expect(cast().accepted).toBe(true);expect(caster.abilities!.mana).toBe(175);expect(caster.abilities!.cooldowns).toEqual({});
  const release=caster.abilities!.pending!.releaseTick;run(game,release-1);expect(target.hp).toBe(20);
  game.tick();expect(target.hp).toBe(120);expect(caster.abilities!.pending!.phase).toBe('recovering');
  expect(caster.abilities!.cooldowns['ability.core.holy-light-lite']).toBe(release+200);
  run(game,8);expect(caster.abilities!.pending).toBeNull();expect(cast().reason).toMatch(/cooling/);
  expect(game.abilities.drainEvents().map(e=>e.event)).toEqual(['accepted','released','healed','finished']);
 });
 it('damages an enemy through the ordinary combat death pipeline',()=>{
  const {game,caster,target,cast}=setup(true);expect(cast().accepted).toBe(true);
  run(game,caster.abilities!.pending!.releaseTick);expect(game.context.get(target.id)).toBeUndefined();
  expect(game.abilities.drainEvents().find(e=>e.event==='damaged')?.amount).toBe(20);
 });
 it('rejects wrong ownership, insufficient mana, out of range and duplicate casts',()=>{
  const {game,caster,target,cast}=setup();
  expect(game.command('player.2',{type:'castAbility',actor:caster.id,binding:'holy-light',target:{kind:'unit',entity:target.id}}).accepted).toBe(false);
  caster.abilities!.mana=24;expect(cast().reason).toMatch(/mana/);caster.abilities!.mana=200;
  target.x=160;expect(cast().accepted).toBe(false);target.x=125;
  expect(cast().accepted).toBe(true);expect(cast().reason).toMatch(/busy/);expect(caster.abilities!.mana).toBe(175);
 });
 it('refunds a stopped preparation but never refunds a released spell',()=>{
  const {game,caster,target,cast}=setup();cast();game.command('player.1',{type:'stop',actors:[caster.id]});
  expect(caster.abilities!.mana).toBe(200);expect(caster.abilities!.pending).toBeNull();
  cast();run(game,caster.abilities!.pending!.releaseTick);game.command('player.1',{type:'stop',actors:[caster.id]});
  expect(caster.abilities!.mana).toBe(175);expect(target.hp).toBe(120);expect(caster.abilities!.cooldowns['ability.core.holy-light-lite']).toBeGreaterThan(game.state.tick);
 });
 it('revalidates release, refunds invalid target and cannot resurrect',()=>{
  const {game,caster,target,cast}=setup();cast();target.hp=0;run(game,caster.abilities!.pending!.releaseTick);
  expect(target.hp).toBe(0);expect(caster.abilities!.mana).toBe(200);expect(caster.abilities!.cooldowns).toEqual({});
 });
 it('replays from a mid-cast save identically with or without draining cosmetic events',()=>{
  const a=setup(),b=setup();a.cast();run(a.game,4);b.game.restore(a.game.snapshot());
  expect(b.game.checksum()).toBe(a.game.checksum());
  for(let i=0;i<30;i++){a.game.tick();b.game.tick();a.game.abilities.drainEvents();expect(a.game.checksum()).toBe(b.game.checksum());}
  expect(b.target.hp).toBe(20); // restore replaces entities; stale caller objects are not mutated.
  expect(b.game.context.get(b.target.id)!.hp).toBe(120);
 });
});

describe('boundary cases and saved authority',()=>{
 it('heals self, clamps overheal and rejects an already healthy target',()=>{
  const {game,caster}=setup();expect(game.command('player.1',{type:'castAbility',actor:caster.id,binding:'holy-light',target:{kind:'unit',entity:caster.id}}).reason).toMatch(/full health/);
  caster.hp=game.context.stats(caster).maxHp-10;
  expect(game.command('player.1',{type:'castAbility',actor:caster.id,binding:'holy-light',target:{kind:'unit',entity:caster.id}}).accepted).toBe(true);
  run(game,caster.abilities!.pending!.releaseTick+1);expect(caster.hp).toBe(game.context.stats(caster).maxHp);
 });
 it.each(['stun','range','owner'] as const)('refunds when %s invalidates a preparing cast',cause=>{
  const {game,caster,target,cast}=setup();cast();const release=caster.abilities!.pending!.releaseTick;
  if(cause==='stun')caster.stunnedUntil=release+10;
  if(cause==='range')target.x=160;
  if(cause==='owner')caster.owner='player.2';
  run(game,release);expect(target.hp).toBe(20);expect(caster.abilities!.mana).toBe(200);expect(caster.abilities!.pending).toBeNull();
 });
 it('retains a visible lethal hit cue after the victim is removed',()=>{
  const {game,caster,cast}=setup(true);cast();run(game,caster.abilities!.pending!.releaseTick);
  expect(game.view('player.1').abilityEvents?.some(e=>e.event==='damaged')).toBe(true);
 });
 it('rejects forged rank state atomically and restores recovery without applying heal twice',()=>{
  const {game,caster,target,cast}=setup();cast();run(game,caster.abilities!.pending!.releaseTick);const saved=game.snapshot(),before=game.checksum();
  const bad=structuredClone(saved);bad.state.entities.find(e=>e.id===caster.id)!.abilities!.ranks['holy-light']=0;
  expect(()=>game.restore(bad)).toThrow(/ability/);expect(game.checksum()).toBe(before);
  game.restore(saved);run(game,30);expect(game.context.get(target.id)!.hp).toBe(120);expect(game.context.get(caster.id)!.abilities!.mana).toBe(175);
 });
 it('gives a neutral camp healer the same hidden ability runtime',()=>{
  const map={...emptyUtcMap(),sandbox:true,entities:[
   {id:'seer',definition:'unit.neutral.root-seer',owner:'none' as const,position:{x:100,y:100},rotation:90},
   {id:'friend',definition:'unit.neutral.webling',owner:'none' as const,position:{x:104,y:100},rotation:270},
  ],camps:[{id:'healers',members:['seer','friend'],home:{x:100,y:100},aggroRange:8,leash:18,aggression:'players' as const}]};
  const game=new Game(map,[{player:0,kind:'human'},{player:1,kind:'human'}]),friend=game.entities.find(e=>e.placement==='friend')!;
  friend.hp=1;run(game,50);expect(friend.hp).toBeGreaterThan(1);expect(game.abilities.drainEvents().some(e=>e.event==='healed')).toBe(true);
  const caster=game.entities.find(e=>e.placement==='seer')!;expect(game.context.def(caster).behaviors.abilities!.bindings[0].command).toBeUndefined();
 });
});
