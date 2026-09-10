import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {content} from '../../src/content/builtin';
import {parseUtcMap} from '../../src/shared/map/utcmap';
import {playableMapError} from '../../src/shared/map/playable';
import {Game} from '../../src/sim/game/game';
import {slots} from './helpers';
const map=parseUtcMap(JSON.parse(readFileSync('assets/maps/skirmish/worldroot-hollow.utcmap','utf8')))!;
it('is playable with both routes to the shared root and every camp',()=>{
 expect(map).toBeTruthy();expect(playableMapError(map)).toBeNull();
 const g=new Game(map,slots,content);
 const root=g.entities.find(e=>e.placement==='worldroot.mine.2')!;
 expect(root.owner).toBe('none');expect(content.get(root.definition).gatheringCapacity).toBe(10);
 for(const start of map.playerStarts){
  const from=g.spatial.cell({x:start.x,y:start.z+8});
  for(const target of [{x:128,y:132},...map.camps.map(c=>({x:c.home.x,y:c.home.y+7}))])expect(g.spatial.navigation.path(from,g.spatial.cell(target)),JSON.stringify({start,target})).not.toBeNull();
 }
 expect(map.camps.filter(c=>c.legendary)).toHaveLength(2);
 expect(map.camps.filter(c=>c.lootPool==='loot.camp.easy')).toHaveLength(4);
 expect(map.camps.filter(c=>c.lootPool==='loot.camp.medium')).toHaveLength(4);
});
it('awards exactly two legendary items across all completed camps, with deterministic replay',()=>{
 const a=new Game(map,slots,content),b=new Game(map,slots,content);
 function clear(g:Game){const drops:string[]=[];for(const camp of map.camps)for(const id of camp.members){const e=g.entities.find(e=>e.placement===id)!;e.hp=0;drops.push(...g.campLoot.onDeath(e).map(e=>e.definition));g.economy.remove(e);}return drops;}
 const drops=clear(a);expect(clear(b)).toEqual(drops);expect(drops.filter(id=>content.get(id).itemTier===3)).toHaveLength(2);
 const restored=new Game(map,slots,content);restored.restore(a.snapshot());expect(restored.snapshot()).toEqual(a.snapshot());
});
it('lets rival workers contest the same root and preserves their assignments',()=>{
 const g=new Game(map,slots,content),root=g.entities.find(e=>e.placement==='worldroot.mine.2')!;
 for(const owner of ['player.1','player.2'] as const){const worker=g.entities.find(e=>e.owner===owner&&content.get(e.definition).behaviors.work)!;worker.x=owner==='player.1'?124:132;worker.y=132;worker.unit!.position=null;g.observation.update();const result=g.command(owner,{type:'gather',actors:[worker.id],target:root.id});expect(result.accepted,JSON.stringify(result)).toBe(true);}
 const saved=g.snapshot(),restored=new Game(map,slots,content);restored.restore(saved);expect(restored.snapshot()).toEqual(saved);
 for(const camp of map.camps.filter(c=>c.legendary)){
  const defenders=map.entities.filter(e=>camp.members.includes(e.id));
  expect(defenders.some(e=>['unit.neutral.amberjaw-staglord','unit.neutral.thornblade-matriarch'].includes(e.definition))).toBe(true);
  const hp=defenders.reduce((n,e)=>n+content.get(e.definition).body!.maxHp,0);
  for(const other of map.camps.filter(c=>!c.legendary))expect(hp).toBeGreaterThan(map.entities.filter(e=>other.members.includes(e.id)).reduce((n,e)=>n+content.get(e.definition).body!.maxHp,0));
 }
});
