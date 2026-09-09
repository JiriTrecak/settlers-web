import {describe,it,expect} from 'vitest';
import {Game} from '../../src/sim/game/game';
import {content} from '../../src/content/builtin';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {resourceStamps} from '../../src/presentation/scenery';
import {placed,slots,run} from './helpers';
function setup(){
 const map=emptyUtcMap();
 const entities=map.playerStarts.flatMap(s=>[
  {...placed(`mine.${s.player}`,'resource.amber.seam',s.x,s.z-14),owner:'none' as const},
  {...placed(`tree.${s.player}`,'resource.forest.tree',s.x+8,s.z+5,{amount:8}),owner:'none' as const},
 ]);
 return new Game({...map,entities},slots,content,159);
}
describe('hall gathering economy',()=>{
 it('auto-starts declared worker groups, depletes trees and deposits both resources into each hall',()=>{
  const g=setup();
  expect(g.entities.filter(e=>e.unit?.order?.type==='gather')).toHaveLength(12);
  run(g,2400);
  for(const id of Object.values(g.state.objectives)){
   const hall=g.context.get(id)!;
   expect(hall.inventory['item.amber']).toBeGreaterThan(60);
   expect(hall.inventory['item.wood']).toBe(88);
  }
  const trees=g.entities.filter(e=>e.definition==='resource.forest.tree');
  expect(trees.every(e=>e.resource!.amount===0)).toBe(true);
  expect(resourceStamps(g.view().entities).some(s=>trees.some(t=>s.id===`resource-${t.id}`))).toBe(false);
  expect('claims' in g.state).toBe(false);
 });
 it('reserves a multi-cell mine footprint and prevents surrounding buildings from sealing its access',()=>{
  const g=setup(),mine=g.entities.find(e=>e.placement==='mine.1')!;
  expect(g.spatial.footprint(mine)).toHaveLength(25);
  expect(g.spatial.footprint(mine).every(i=>g.spatial.resources[i]===mine.id)).toBe(true);
  const worker=g.entities.find(e=>e.owner==='player.1'&&content.get(e.definition).behaviors.work)!;
  expect(g.canBuild('player.1','building.ants.house',{x:mine.x+6,y:mine.y},worker.id)).toMatch(/Leave access/);
 });
 it('restores an in-flight harvest to the identical future without duplicating deposits',()=>{
  const g=setup();run(g,400);
  expect(g.entities.some(e=>e.unit?.cargo)).toBe(true);
  const restored=setup();restored.restore(g.snapshot());
  run(g,800);run(restored,800);
  expect(restored.snapshot()).toEqual(g.snapshot());
 });
});
