import {expect,it} from 'vitest';
import {armyRoster,createArmyEncounter,engageArmies,castArmyHeroSpell} from '../../scripts/bench/ant-army-combat/scenario';
it('loads every published ant role and fights through the normal simulation',()=>{
 const game=createArmyEncounter();
 for(const side of ['player.1','player.2'])for(const row of armyRoster)
  expect(game.entities.filter(e=>e.owner===side&&e.definition==='unit.ants.'+row.slug)).toHaveLength(row.count);
 const initial=game.entities.reduce((n,e)=>n+(e.hp??0),0),casts=new Set<string>();let missiles=0,shells=0;
 engageArmies(game);
 for(let i=0;i<1800;i++){
  game.tick();missiles=Math.max(missiles,game.state.missiles.length);shells=Math.max(shells,game.state.shells.length);
  for(const d of game.state.spellDeliveries)casts.add(d.ability);
  for(const e of game.entities)for(const s of e.spellStatuses??[])casts.add(s.ability);
 }
 expect(game.entities.reduce((n,e)=>n+(e.hp??0),0)).toBeLessThan(initial);
 expect(missiles).toBeGreaterThan(0);expect(shells).toBeGreaterThan(0);
 expect(casts.has('ability.ants.thorn-rush')).toBe(true);
 expect(casts.has('ability.ants.nectar-mend')).toBe(true);
 expect(casts.has('ability.ants.silken-snare')).toBe(true);
 expect(casts.has('ability.ants.amber-seal')).toBe(true);
 expect(casts.has('ability.ants.root-bind')).toBe(true);
 expect(casts.has('ability.marshal.rally')).toBe(true);
 expect(game.entities.filter(e=>e.definition==='unit.ants.settler'&&e.hp!>0)).toHaveLength(4);
},60000);

it('exposes learned hero commands through the real cast pipeline',()=>{
 const game=createArmyEncounter(),hero=game.entities.find(e=>e.owner==='player.1'&&e.definition==='unit.ants.marshal')!;
 expect(hero.abilities!.ranks).toMatchObject({faultline:2,rally:1,carapace:1,crownfall:1});
 expect(castArmyHeroSpell(game,'carapace').accepted).toBe(true);
 for(let i=0;i<40;i++)game.tick(undefined,{passiveUnits:true});
 expect(hero.spellStatuses?.some(s=>s.ability==='ability.marshal.carapace')).toBe(true);
 const target=game.context.create({id:'hero-review-target',definition:'unit.ants.warrior',position:{x:hero.x+8,y:hero.y},rotation:0,owner:'player.2'});
 game.observation.update();const hp=target.hp!;
 expect(castArmyHeroSpell(game,'faultline')).toMatchObject({accepted:true});
 for(let i=0;i<60;i++)game.tick(undefined,{passiveUnits:true});
 expect(target.hp!).toBeLessThan(hp);
});
