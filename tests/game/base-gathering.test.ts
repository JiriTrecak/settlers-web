import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {content} from '../../src/content/builtin';
import {Game} from '../../src/sim/game/game';
import {emptyUtcMap,type UtcMap} from '../../src/shared/map/utcmap';
import {playableMapError} from '../../src/shared/map/playable';
import {baseGathering} from '../../src/shared/baseGathering';
import {editorEntities} from '../../src/presentation/scenery';
import {placed,slots,run} from './helpers';
const pattern=[[-8,24],[-4,28],[0,28],[4,28],[8,24]];
function arena(){
 const map=emptyUtcMap();
 const entities=map.playerStarts.flatMap(s=>pattern.map(([dx,dy],i)=>({...placed(`node.${s.player}.${i}`,'building.neutral.amber-mine',s.x+dx,s.z-dy),owner:'none' as const})));
 return {...map,entities};
}
it.each(['ants','beetles'] as const)('%s opens with five workers in one row, immediately distributed across five nodes',race=>{
 const g=new Game(arena(),slots.map(s=>({...s,race}))),hall=g.context.get(g.state.objectives['player.1'])!;
 const workers=g.entities.filter(e=>e.owner==='player.1'&&content.get(e.definition).behaviors.work);
 expect(workers).toHaveLength(5);expect(new Set(workers.map(w=>w.y)).size).toBe(1);
 const targets=workers.map(w=>w.unit!.order?.type==='gather'?w.unit!.order.target:null);
 expect(targets.every(t=>t!==null)).toBe(true);expect(new Set(targets).size).toBe(5);
 expect(g.view('player.1').entities.find(e=>e.id===hall.id)?.baseGathering).toEqual({workers:5,recommendedWorkers:10});
 run(g,400);expect(g.state.wallets['player.1']['item.amber']).toBeGreaterThan(500);
 const restored=new Game(g.map,g.slots);restored.restore(g.snapshot());run(g,100);run(restored,100);
 expect(restored.snapshot()).toEqual(g.snapshot());
 g.command('player.1',{type:'stop',actors:workers.map(w=>w.id)});run(g,600);
 expect(g.view('player.1').entities.find(e=>e.id===hall.id)?.baseGathering?.workers).toBe(0);
});
it('partitions deposits between nearby bases, excludes enemy workers, updates depletion and base destruction',()=>{
 const entities=editorEntities(arena()),hall=entities.find(e=>e.owner==='player.1'&&content.get(e.definition).behaviors.storage?.gathering)!;
 const nodes=entities.filter(e=>e.resource&&Math.hypot(e.x-hall.x,e.y-hall.y)<40);
 const worker=entities.find(e=>e.owner==='player.1'&&e.unit)!,enemy=entities.find(e=>e.owner==='player.2'&&e.unit)!;
 const expansion={...hall,id:999,x:hall.x+20,y:hall.y-26};entities.push(expansion);
 let result=baseGathering(entities,content,new Map([[worker.id,nodes[0].id],[enemy.id,nodes[0].id]]));
 expect([...result.values()].reduce((n,v)=>n+v.workers,0)).toBe(1);
 expect(result.get(hall.id)!.recommendedWorkers+result.get(expansion.id)!.recommendedWorkers).toBe(10);
 nodes[0].resource!.amount=0;result=baseGathering(entities,content);
 expect(result.get(hall.id)!.recommendedWorkers+result.get(expansion.id)!.recommendedWorkers).toBe(8);
 expansion.hp=0;result=baseGathering(entities,content);expect(result.has(expansion.id)).toBe(false);expect(result.get(hall.id)!.recommendedWorkers).toBe(8);
});
it.each(['echo-isles','turtle-rock'])('%s keeps five-node sites and every starting hall has an aligned accessible mining line',name=>{
 const map=JSON.parse(readFileSync(`assets/maps/skirmish/${name}.utcmap`,'utf8')) as UtcMap;
 expect(playableMapError(map)).toBeNull();
 const nodes=map.entities.filter(e=>e.definition==='building.neutral.amber-mine');
 const groups=new Map<string,typeof nodes>();
 for(const e of nodes){const key=e.id.slice(0,e.id.lastIndexOf('.'));groups.set(key,[...(groups.get(key)??[]),e]);}
 expect(groups.size).toBe(name==='echo-isles'?5:10);
 for(const group of groups.values()){
  expect(group).toHaveLength(5);const sorted=group.slice().sort((a,b)=>a.position.x-b.position.x);
  expect(sorted.map(e=>e.position.x-sorted[0].position.x)).toEqual([0,4,8,12,16]);
  expect(sorted[0].position.y).toBe(sorted[4].position.y);
  expect(sorted.slice(1,4).map(e=>e.position.y)).toEqual(Array(3).fill(sorted[2].position.y));
  expect(Math.abs(sorted[0].position.y-sorted[2].position.y)).toBe(4);
 }
 const g=new Game(map,map.playerStarts.map((_,player)=>({player,kind:'human'})));
 for(const start of map.playerStarts){
  const owner=`player.${start.player}` as const,hall=g.context.get(g.state.objectives[owner])!;
  const nearby=nodes.filter(e=>Math.hypot(e.position.x-start.x,e.position.y-start.z)<40);
  expect(nearby).toHaveLength(5);expect(nearby.reduce((n,e)=>n+e.position.x,0)/5).toBe(start.x);
  expect(nearby.map(e=>Math.abs(e.position.y-start.z)).sort()).toEqual([24,24,28,28,28]);
  const workers=g.entities.filter(e=>e.owner===owner&&content.get(e.definition).behaviors.work);
  expect(workers.every(w=>g.spatial.unitWalkable(w,w))).toBe(true);
  expect(g.view(owner).entities.find(e=>e.id===hall.id)?.baseGathering).toEqual({workers:5,recommendedWorkers:10});
  for(const node of nearby){const target=g.entities.find(e=>e.placement===node.id)!;
   const worker=workers[0];const approaches=[1,2,3].flatMap(r=>g.spatial.perimeter(target,r));
   expect(approaches.some(p=>g.spatial.unitWalkable(p,worker)&&g.spatial.attackClear(p,target,false)&&g.spatial.findPath(g.spatial.cell(worker),g.spatial.cell(p),undefined,Infinity,worker)!==null),node.id).toBe(true);
  }
 }
},60000);
