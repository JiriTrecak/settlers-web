import {expect,it} from 'vitest';
import {game,placed,run,slots} from './helpers';
import {Game} from '../../src/sim/game/game';
import {content} from '../../src/content/builtin';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {heroRoster} from '../../src/content/heroRoster';
import {createArmyEncounter} from '../../scripts/bench/ant-army-combat/scenario';
import {commandCard,commandMenu,commandPage,commandPageCount,shortcutCommand} from '../../src/presentation/commands';
it('Rootbreaker keeps his large physical body with a 20% smaller visual model',()=>{
 const g=new Game(emptyUtcMap(),[{...slots[0],hero:'unit.ants.rootbreaker'},slots[1]]);
 const own=g.entities.filter(e=>e.owner==='player.1'&&g.registry.get(e.definition).hero);
 expect(own.map(e=>e.definition)).toEqual(['unit.ants.rootbreaker']);
 const d=content.get('unit.ants.rootbreaker'),warrior=content.get('unit.ants.warrior');
 expect(d.modelScale).toBeCloseTo(warrior.modelScale!*2*.8);expect(d.dimensions!.height).toBe(warrior.dimensions!.height*2);
 expect(d.dimensions!.radius).toBe(3);expect(d.dimensions!.formationSpacing).toBe(6.5);
 expect(d.behaviors.abilities!.bindings.map(b=>b.command?.hotkey)).toEqual(['Q','W','E','R']);
 expect(own[0].abilities!.ranks).toEqual({skullcrack:0,roar:0,presence:0,uproot:0});
});
it('shows every Rootbreaker skill in slots 1–4 with Back separate, including locked and completed skills',()=>{
 const g=new Game(emptyUtcMap(),[{...slots[0],hero:'unit.ants.rootbreaker'},slots[1]]);
 const h=g.entities.find(e=>e.owner==='player.1'&&e.definition==='unit.ants.rootbreaker')!;
 const menu=()=>commandMenu(commandCard(g.view(h.owner),[h.id],h.owner,g.registry),'category.hero.skills',g.registry).entries;
 const checkSlots=()=>{
  const entries=menu();expect(commandPageCount(entries)).toBe(1);
  const page=commandPage(entries,0),skills=page.filter(s=>s.binding.type==='learnAbility');
  expect(skills.map(s=>[s.binding.id,s.column,s.row])).toEqual([
   ['learn:skullcrack',1,1],['learn:roar',2,1],['learn:presence',3,1],['learn:uproot',4,1],
  ]);
  expect(page.find(s=>s.binding.type==='back')).toMatchObject({column:1,row:3});
  expect(new Set(page.map(s=>`${s.column}:${s.row}`)).size).toBe(page.length);
  for(const [i,key]of ['q','w','e','r'].entries())expect(shortcutCommand(entries,0,key)?.id).toBe(skills[i].binding.id);
  return skills.map(s=>s.binding);
 };
 expect(checkSlots().map(s=>s.enabled)).toEqual([true,true,true,false]);
 expect(checkSlots()[3].reason).toBe('Requires level 5');
 expect(g.command(h.owner,{type:'learnAbility',actor:h.id,ability:'presence'}).accepted).toBe(true);g.observation.update();
 expect(checkSlots().every(s=>!s.enabled)).toBe(true);
 h.progression!.experience=g.context.def(h).behaviors.progression!.levels[10].experience;g.observation.update();
 for(const id of ['skullcrack','roar','presence','uproot']){
  const skill=g.context.def(h).behaviors.abilities!.bindings.find(b=>b.id===id)!;
  while(h.abilities!.ranks[id]<skill.learning!.requiredLevels.length){
   const entry=checkSlots().find(s=>s.binding===id)!;expect(entry.enabled).toBe(true);
   if(entry.type!=='learnAbility')throw Error('Expected a learn command');
   expect(g.command(h.owner,entry.immediate!).accepted).toBe(true);g.observation.update();
  }
 }
 expect(checkSlots().map(s=>s.reason)).toEqual(Array(4).fill('Fully learned'));
 expect(checkSlots().every(s=>!s.enabled)).toBe(true);
});
it('the Sanctuary recruits Rootbreaker as the second distinct hero after a Hall upgrade',()=>{
 const g=game([placed('altar','building.ants.sanctuary',193.5,237.5),placed('supply','building.ants.house',245,240)]);
 const altar=g.entities.find(e=>e.placement==='altar')!,hall=g.context.get(g.state.objectives['player.1'])!;
 g.state.wallets['player.1']={'item.amber':6000,'item.wood':2000};
 const recruit=()=>g.command('player.1',{type:'produce',actor:altar.id,definition:'unit.ants.rootbreaker'});
 expect(recruit()).toMatchObject({accepted:false,reason:expect.stringContaining('roster full')});
 hall.definition='building.ants.great-mound';hall.hp=g.registry.get(hall.definition).body!.maxHp;g.observation.update();
 expect(recruit().accepted).toBe(true);run(g,2201);
 const hero=g.entities.find(e=>e.owner==='player.1'&&e.definition==='unit.ants.rootbreaker')!;expect(hero).toBeDefined();
 expect(heroRoster(g.context.populationCandidates(),'player.1',g.registry)).toMatchObject({used:2,capacity:2});
 expect(recruit().accepted).toBe(false);
 hero.progression!.experience=1120;g.observation.update();
 for(const ability of ['skullcrack','roar','presence','skullcrack','uproot'])expect(g.command('player.1',{type:'learnAbility',actor:hero.id,ability}).accepted).toBe(true);
 g.economy.remove(hero);g.revival.retain(hero);g.observation.update();
 expect(g.command('player.1',{type:'revive',actor:altar.id,hero:hero.id}).accepted).toBe(true);run(g,2001);
 expect(g.context.get(hero.id)?.abilities?.ranks).toEqual({skullcrack:2,roar:1,presence:1,uproot:1});
 expect(g.context.get(hero.id)?.progression?.experience).toBe(1120);
});
it('the mixed army scenario includes a learned Rootbreaker on both teams',()=>{
 const g=createArmyEncounter(1,'unit.ants.rootbreaker');
 const heroes=g.entities.filter(e=>g.registry.get(e.definition).hero);expect(heroes).toHaveLength(2);
 for(const hero of heroes)expect(hero.abilities?.ranks).toEqual({skullcrack:2,roar:1,presence:1,uproot:1});
});
