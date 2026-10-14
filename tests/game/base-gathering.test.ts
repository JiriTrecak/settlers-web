import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import {content} from '../../src/content/builtin';
import {Game} from '../../src/sim/game/game';
import {emptyUtcMap,type UtcMap} from '../../src/shared/map/utcmap';
import {playableMapError} from '../../src/shared/map/playable';
import {baseGathering} from '../../src/shared/baseGathering';
import {testContent} from '../fixtures/content';
import {placed,slots,run} from './helpers';
const mine='building.test.neutral-amber-mine',perNode=testContent.get(mine).harvesting!.recommendedWorkers;
const pattern=[[-8,24],[-4,28],[0,28],[4,28],[8,24]];
function arena(){
 const map=emptyUtcMap();
 const entities=map.playerStarts.flatMap(s=>pattern.map(([dx,dy],i)=>({...placed(`node.${s.player}.${i}`,mine,s.x+dx,s.z-dy),owner:'none' as const})));
 return {...map,entities};
}
it.each(Object.keys(testContent.rules.races))('%s opens with its gathering workers in one row, immediately distributed across distinct nodes',race=>{
 const g=new Game(arena(),slots.map(s=>({...s,race})),testContent),hall=g.context.get(g.state.objectives['player.1'])!;
 const workers=g.entities.filter(e=>e.owner==='player.1'&&testContent.get(e.definition).behaviors.work);
 expect(workers).toHaveLength(pattern.length);expect(new Set(workers.map(w=>w.y)).size).toBe(1);
 const targets=workers.map(w=>w.unit!.order?.type==='gather'?w.unit!.order.target:null);
 expect(targets.every(t=>t!==null)).toBe(true);expect(new Set(targets).size).toBe(pattern.length);
 expect(g.view('player.1').entities.find(e=>e.id===hall.id)?.baseGathering).toEqual({workers:pattern.length,recommendedWorkers:pattern.length*perNode});
 const start=g.state.wallets['player.1']['item.test.amber'];
 run(g,400);expect(g.state.wallets['player.1']['item.test.amber']).toBeGreaterThan(start);
 const restored=new Game(g.map,g.slots,testContent);restored.restore(g.snapshot());run(g,100);run(restored,100);
 expect(restored.snapshot()).toEqual(g.snapshot());
 g.command('player.1',{type:'stop',actors:workers.map(w=>w.id)});run(g,600);
 expect(g.view('player.1').entities.find(e=>e.id===hall.id)?.baseGathering?.workers).toBe(0);
});
it('partitions deposits between nearby bases, excludes enemy workers, updates depletion and base destruction',()=>{
 const g=new Game(arena(),slots,testContent);
 const entities=g.entities.map(e=>({...e,resource:e.resource&&{...e.resource}}));
 const hall=entities.find(e=>e.owner==='player.1'&&testContent.get(e.definition).behaviors.storage?.gathering)!;
 const nodes=entities.filter(e=>e.resource&&Math.hypot(e.x-hall.x,e.y-hall.y)<40);
 const worker=entities.find(e=>e.owner==='player.1'&&e.unit)!,enemy=entities.find(e=>e.owner==='player.2'&&e.unit)!;
 const expansion={...hall,id:999,x:hall.x+20,y:hall.y-26};entities.push(expansion);
 let result=baseGathering(entities,testContent,new Map([[worker.id,nodes[0].id],[enemy.id,nodes[0].id]]));
 expect([...result.values()].reduce((n,v)=>n+v.workers,0)).toBe(1);
 expect(result.get(hall.id)!.recommendedWorkers+result.get(expansion.id)!.recommendedWorkers).toBe(nodes.length*perNode);
 nodes[0].resource!.amount=0;result=baseGathering(entities,testContent);
 expect(result.get(hall.id)!.recommendedWorkers+result.get(expansion.id)!.recommendedWorkers).toBe((nodes.length-1)*perNode);
 expansion.hp=0;result=baseGathering(entities,testContent);expect(result.has(expansion.id)).toBe(false);expect(result.get(hall.id)!.recommendedWorkers).toBe((nodes.length-1)*perNode);
});

// Content validation over every shipped skirmish map and race (shipped content; playable.ts reads it globally).
const maps=readdirSync('assets/maps/skirmish').filter(f=>f.endsWith('.utcmap')).map(f=>join('assets/maps/skirmish',f));
it.each(maps.flatMap(file=>Object.keys(content.rules.races).map(race=>({file,race}))))('$file ($race) gives every starting hall reachable workers and deposits',({file,race})=>{
 const map=JSON.parse(readFileSync(file,'utf8')) as UtcMap;
 expect(playableMapError(map)).toBeNull();
 const g=new Game(map,map.playerStarts.map((_,player)=>({player,kind:'human' as const,race})),content);
 for(const start of map.playerStarts){
  const owner=`player.${start.player}` as const,hall=g.context.get(g.state.objectives[owner])!;
  // The hall's own gathering source (e.g. the starting mineral), not incidental forest.
  const rule=content.get(hall.definition).behaviors.storage!.gathering!,recipe=content.get(rule.item).creation;
  const nearby=g.entities.filter(e=>e.resource&&recipe?.method==='harvest'&&e.definition===recipe.source&&Math.hypot(e.x-hall.x,e.y-hall.y)<rule.radius);
  expect(nearby.length).toBeGreaterThan(0);
  const workers=g.entities.filter(e=>e.owner===owner&&content.get(e.definition).behaviors.work);
  expect(workers.length).toBeGreaterThan(0);
  expect(workers.every(w=>g.spatial.unitWalkable(w,w))).toBe(true);
  expect(g.view(owner).entities.find(e=>e.id===hall.id)?.baseGathering?.recommendedWorkers).toBeGreaterThan(0);
  for(const target of nearby){
   const worker=workers[0];const approaches=[1,2,3].flatMap(r=>g.spatial.perimeter(target,r));
   expect(approaches.some(p=>g.spatial.unitWalkable(p,worker)&&g.spatial.attackClear(p,target,false)&&g.spatial.findPath(g.spatial.cell(worker),g.spatial.cell(p),undefined,Infinity,worker)!==null),target.placement??undefined).toBe(true);
  }
 }
},60000);
