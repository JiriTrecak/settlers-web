import {describe,it,expect} from 'vitest';
import {snapPlacement} from '../../src/shared/spatial/placement';
import {Game} from '../../src/sim/game/game';
import {testContent} from '../fixtures/content';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {game,placed,slots,run} from './helpers';
function setup(){
 const map=emptyUtcMap();
 const entities=map.playerStarts.flatMap(s=>[
  {...placed(`mine.${s.player}`,'building.test.neutral-amber-mine',s.x,s.z-24),owner:'none' as const},
  {...placed(`tree.${s.player}`,'resource.test.forest-tree',s.x+8,s.z+5,{amount:8}),owner:'none' as const},
 ]);
 return new Game({...map,entities},slots,testContent,159);
}
describe('hall gathering economy',()=>{
 it('auto-starts declared worker groups, depletes trees and deposits both resources into each hall',()=>{
  const g=setup();
  expect(g.entities.filter(e=>e.unit?.order?.type==='gather')).toHaveLength(2*(testContent.rules.startingSetup.gathering??[]).reduce((n,group)=>n+group.workers,0));
  for(const owner of ['player.1','player.2'] as const){
   const w=g.entities.find(e=>e.owner===owner&&testContent.get(e.definition).behaviors.work)!;
   const t=g.entities.find(e=>e.placement===`tree.${owner.slice(-1)}`)!;
   g.command(owner,{type:'gather',actors:[w.id],target:t.id});
  }
  run(g,2400);
  for(const id of Object.values(g.state.objectives)){
   const hall=g.context.get(id)!;
   expect(g.state.wallets[hall.owner]['item.test.amber']).toBeGreaterThan(testContent.rules.startingSetup.inventory['item.test.amber']);
   expect(g.state.wallets[hall.owner]['item.test.wood']).toBe(testContent.rules.startingSetup.inventory['item.test.wood']+8);
  }
  const trees=g.entities.filter(e=>e.definition==='resource.test.forest-tree');
  expect(trees.every(e=>e.resource!.amount===0)).toBe(true);
 });
 it('reserves a multi-cell mine footprint and prevents surrounding buildings from sealing its access',()=>{
  const g=game([{...placed('mine.1','building.test.neutral-amber-mine',128,128),owner:'none'},placed('pioneer','unit.test.settler',120,128)]),mine=g.entities.find(e=>e.placement==='mine.1')!;
  const footprint=testContent.get(mine.definition).footprint!;
  expect(g.spatial.footprint(mine)).toHaveLength(footprint.width*footprint.depth);
  expect(g.spatial.footprint(mine).every(i=>g.spatial.resources[i]===mine.id)).toBe(true);
  const worker=g.entities.find(e=>e.placement==='pioneer')!;
  expect(g.canBuild('player.1','building.test.house',snapPlacement(testContent.get('building.test.house'),{x:mine.x+(footprint.width+testContent.get('building.test.house').footprint!.width)/2,y:mine.y}),worker.id)).toMatch(/Leave access/);
 });
 it('restores an in-flight harvest to the identical future without duplicating deposits',()=>{
  const g=setup();for(let tick=0;tick<800&&!g.entities.some(e=>e.unit?.cargo);tick++)g.tick();
  expect(g.entities.some(e=>e.unit?.cargo)).toBe(true);
  const restored=setup();restored.restore(g.snapshot());
  run(g,800);run(restored,800);
  expect(restored.snapshot()).toEqual(g.snapshot());
 });
});

describe('ten-resource trips',()=>{
 for(const [definition,item] of [['building.test.neutral-amber-mine','item.test.amber'],['resource.test.forest-tree','item.test.wood']] as const){
  it(`delivers ten ${item} exactly once per full load, including an in-flight save`,()=>{
   const map=emptyUtcMap(),start=map.playerStarts[0];
   const g=new Game({...map,entities:[{...placed('source',definition,start.x+(definition==='resource.test.forest-tree'?10:24),start.z+4,{amount:definition==='resource.test.forest-tree'?10:100}),owner:'none'}]},slots,testContent);
   // Isolate one gatherer so the source/receipt assertions are independent of startup groups.
   const owned=g.entities.filter(e=>e.owner==='player.1'&&testContent.get(e.definition).behaviors.work);
   g.command('player.1',{type:'stop',actors:owned.map(e=>e.id)});
   const w=owned[0],source=g.entities.find(e=>e.placement==='source')!,hall=g.context.get(g.state.objectives['player.1'])!;
   const before=g.state.wallets[hall.owner][item];
   expect(g.command('player.1',{type:'gather',actors:[w.id],target:source.id}).accepted).toBe(true);
   for(let i=0;i<1600&&!w.unit!.cargo;i++)g.tick();
   expect(w.unit!.cargo).toEqual({item,amount:10});
   expect(source.resource!.amount).toBe(definition==='resource.test.forest-tree'?0:90);expect(g.state.wallets[hall.owner][item]).toBe(before);
   const restored=new Game(g.map,slots,testContent);restored.restore(g.snapshot());
   let receipts=0;
   for(let i=0;i<1600&&g.state.wallets[hall.owner][item]===before;i++){
    g.tick();restored.tick();
    for(const r of g.economy.deliveries)if(r.owner===w.owner && r.item===item){expect(r.amount).toBe(10);receipts++;}
   }
   expect(g.state.wallets[hall.owner][item]).toBe(before+10);expect(receipts).toBe(1);
   expect(restored.snapshot()).toEqual(g.snapshot());
  });
 }
});
