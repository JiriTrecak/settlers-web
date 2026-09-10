import {describe,it,expect} from 'vitest';
import {game,placed,run} from './helpers';
import {commandCard,commandMenu} from '../../src/presentation/commands';
import {isStunned} from '../../src/sim/game/effects';
const id=(name:string)=>`spell.marshal.${name}`;
function setup(){const g=game([{...placed('enemy','unit.ants.warrior',224,230),owner:'player.2'}]);const hero=g.entities.find(e=>e.owner==='player.1'&&e.spellcasting)!;return {g,hero,enemy:g.entities.find(e=>e.placement==='enemy')!};}
describe('declarative marshal abilities',()=>{
 it('spends exactly ten level-earned points across three ranked skills and a level-six ultimate',()=>{
  const {g,hero}=setup();
  expect(g.command('player.1',{type:'learnAbility',actor:hero.id,ability:id('crownfall')}).reason).toMatch(/level 6/);
  expect(g.command('player.1',{type:'learnAbility',actor:hero.id,ability:id('faultline')}).accepted).toBe(true);
  expect(g.command('player.1',{type:'learnAbility',actor:hero.id,ability:id('rally')}).reason).toMatch(/skill points/);
  hero.progression!.experience=3200;
  for(const name of ['faultline','rally','carapace'])for(let rank=hero.spellcasting!.learned[id(name)]??0;rank<3;rank++)expect(g.spells.learn(hero,id(name))).toBeNull();
  expect(g.spells.learn(hero,id('crownfall'))).toBeNull();expect(g.spells.points(hero)).toBe(0);
  expect(g.context.stats(hero).level).toBe(10);expect(g.spells.learn(hero,id('crownfall'))).toMatch(/fully/);
  const save=g.snapshot(),r=setup();r.g.restore(save);expect(r.g.checksum()).toBe(g.checksum());
  const forged=g.snapshot();forged.state.entities.find(e=>e.id===hero.id)!.spellcasting!.mana=99999;
  expect(()=>g.restore(forged)).toThrow(/ability state/);
 });
 it('validates mana, ownership and range, resolves a delayed shockwave through authoritative combat, and grants XP',()=>{
  const {g,hero,enemy}=setup();g.spells.learn(hero,id('faultline'));
  expect(g.command('player.2',{type:'cast',actor:hero.id,ability:id('faultline'),point:{x:224,y:230}}).accepted).toBe(false);
  expect(g.spells.cast(hero,id('faultline'),{x:250,y:250})).toMatch(/range/);
  enemy.hp=20;const hp=hero.hp, mana=hero.spellcasting!.mana;
  expect(g.command('player.1',{type:'cast',actor:hero.id,ability:id('faultline'),point:{x:226,y:230}}).accepted).toBe(true);
  expect(hero.spellcasting!.mana).toBe(mana-60);expect(g.spells.resolve()).toEqual([]);expect(enemy.hp).toBe(20);
  run(g,20);expect(g.context.get(enemy.id)).toBeUndefined();expect(hero.progression!.experience).toBeGreaterThan(0);expect(hero.hp).toBe(hp);
  expect(g.spells.cast(hero,id('faultline'),{x:226,y:230})).toMatch(/cooling/);
 });
 it('rallies allies only, does not stack identical buffs, and expires defensive and stun effects',()=>{
  const {g,hero,enemy}=setup();hero.progression!.experience=3200;
  for(const name of ['rally','carapace'])g.spells.learn(hero,id(name));
  const ally=g.entities.find(e=>e.owner==='player.1'&&e.definition==='unit.ants.warrior')!;
  const before=g.context.stats(ally).damage,enemyBefore=g.context.stats(enemy).damage;
  g.spells.cast(hero,id('rally'));g.state.tick+=20;g.spells.resolve();
  expect(g.context.stats(ally).damage).toBeCloseTo(before*1.1);expect(g.context.stats(enemy).damage).toBe(enemyBefore);
  hero.spellcasting!.cooldowns[id('rally')]=0;g.spells.cast(hero,id('rally'));g.state.tick+=20;g.spells.resolve();
  expect(g.context.stats(ally).damage).toBeCloseTo(before*1.1);
  g.spells.cast(hero,id('carapace'));g.state.tick+=20;g.spells.resolve();
  const initial=hero.hp!;g.combat.resolve([{source:enemy.id,target:hero.id,damage:100,damageType:'melee'}]);
  expect(initial-hero.hp!).toBeLessThan(70);
  hero.effects!.push({ability:id('faultline'),rank:1,source:enemy.id,expires:g.state.tick+10});expect(isStunned(hero,g.registry)).toBe(true);
  g.state.tick+=500;g.spells.tick();expect(isStunned(hero,g.registry)).toBe(false);expect(g.context.stats(ally).damage).toBe(before);
 });
 it('derives learning and casting cards from the selected hero without leaking private mana',()=>{
  const {g,hero}=setup();const cards=commandCard(g.view('player.1'),[hero.id],'player.1',g.registry);
  expect(cards.filter(c=>c.type==='cast')).toHaveLength(4);
  expect(cards.filter(c=>c.type==='cast').every(c=>!c.enabled)).toBe(true);
  const learning=commandMenu(cards,g.context.def(hero).behaviors.spellcasting!.learningCategory,g.registry);
  expect(learning.entries.filter(c=>c.type==='learnAbility')).toHaveLength(4);
  g.spells.learn(hero,id('faultline'));g.observation.update();
  const cast=commandCard(g.view('player.1'),[hero.id],'player.1',g.registry).find(c=>c.ability===id('faultline')&&c.type==='cast')!;
  expect(cast.enabled).toBe(true);expect(cast.costs[0]).toMatchObject({kind:'mana',amount:60});
  expect(g.view('player.2').entities.find(e=>e.id===hero.id)?.spellcasting).toBeUndefined();
 });
 it('does not reveal spell targets in explored but currently hidden terrain',()=>{
  const {g,hero,enemy}=setup();enemy.x=hero.x;enemy.y=hero.y;
  g.spells.learn(hero,id('faultline'));
  const point={x:hero.x+10,y:hero.y};
  const knowledge=g.observation.snapshot(),observer=knowledge.find(m=>m.owner==='player.2')!;
  observer.cells.fill(1);observer.cells[g.spatial.cell(hero)]=2;g.observation.restore(knowledge);
  expect(g.spells.cast(hero,id('faultline'),point)).toBeNull();
  expect(g.view('player.1').visuals).toHaveLength(1);expect(g.view('player.2').visuals).toHaveLength(0);
  hero.spellcasting!.pending=null;hero.spellcasting!.cooldowns[id('faultline')]=0;
  observer.cells[g.spatial.cell(point)]=2;g.observation.restore(knowledge);
  expect(g.spells.cast(hero,id('faultline'),point)).toBeNull();
  expect(g.view('player.2').visuals).toHaveLength(1);
 });

});
