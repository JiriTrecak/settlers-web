import {describe,it,expect} from 'vitest';
import {game,placed} from './helpers';
import {TargetIndex} from '../../src/sim/game/targetIndex';
import {ResourceScenery} from '../../src/presentation/scenery';

describe('map-scale acceleration preserves observations and combat candidates',()=>{
 it('includes every target in exact range, including rotated large footprints and bucket edges',()=>{
  const g=game([placed('soldier','unit.ants.warrior',23,23),placed('hall','building.ants.fort',36,36)]);
  const hall=g.entities.find(e=>e.placement==='hall')!;
  for(const rotation of [0,90,180,270]){
   hall.rotation=rotation;
   const bodies=g.context.liveBodies(),index=new TargetIndex(bodies,g.registry);
   for(let y=5;y<55;y+=2.3)for(let x=5;x<55;x+=2.7){
    const point={x,y},candidates=new Set(index.near(point,7));
    for(const e of bodies)if(g.spatial.pointRange(point,e)<=49)expect(candidates.has(e)).toBe(true);
   }
  }
 });
 it('reuses unchanged scenery and leaves previous tree snapshots intact after damage',()=>{
  const tree={...placed('tree','resource.forest.tree',40,40),owner:'none' as const};
  const g=game([tree]),scenery=new ResourceScenery(),before=g.view().entities;
  const stamps=scenery.project(before);g.tick();expect(scenery.project(g.view().entities)).toBe(stamps);
  const e=g.entities.find(e=>e.placement==='tree')!,old=before.find(v=>v.id===e.id)!;
  e.resource!.felling!.hp--;e.resource!.felling!.lastHitTick=g.state.tick;g.observation.update();
  const after=g.view().entities.find(v=>v.id===e.id)!;
  expect(old.resource!.felling!.hp).toBe(after.resource!.felling!.hp+1);
  expect(scenery.project(g.view().entities).some(s=>s.id===`resource-${e.id}`)).toBe(false);
  expect(stamps.some(s=>s.id===`resource-${e.id}`)).toBe(true);
 });
});

describe('blocked worker departure',()=>{
 it('rejects overlapping traffic before searching distant work targets, then routes immediately when traffic leaves',()=>{
  const g=game([placed('worker','unit.ants.settler',205,210),placed('other','unit.ants.warrior',205,210)]);
  const worker=g.entities.find(e=>e.placement==='worker')!,other=g.entities.find(e=>e.placement==='other')!;
  let searched=0;const path=g.spatial.navigation.path.bind(g.spatial.navigation);
  g.spatial.navigation.path=(...args)=>{searched++;return path(...args);};
  expect(g.spatial.route(worker,{x:225,y:225},true)).toBe(false);
  expect(searched).toBe(0);
  other.x=200;other.y=200;
  expect(g.spatial.route(worker,{x:225,y:225},true)).toBe(true);
  expect(worker.unit!.goal).toBe(g.spatial.cell({x:225,y:225}));
 });
});
