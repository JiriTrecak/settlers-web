import {describe,it,expect} from 'vitest';
import {game,placed} from './helpers';
import {TargetIndex} from '../../src/sim/game/targetIndex';

describe('target index returns every combat candidate in range',()=>{
 it('includes every target in exact range, including rotated large footprints and bucket edges',()=>{
  const g=game([placed('soldier','unit.test.warrior',23,23),placed('hall','building.test.fort',36,36)]);
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
 it('refreshes pooled target buckets through movement, rotation, removal and restored identities',()=>{
  const g=game([placed('soldier','unit.test.warrior',23,23),placed('hall','building.test.fort',36,36)]);
  const bodies=g.context.liveBodies(),index=new TargetIndex(bodies,g.registry);
  const before=[...index.near({x:30,y:30},100)];
  let current=bodies;
  for(let step=0;step<20;step++){
   // A restore supplies fresh records with the same IDs. Empty frames must also
   // remove every previous occupant before a later refill.
   current=step%5===4?[]:structuredClone(bodies).reverse();
   for(const e of current){e.x+=step*3-24;e.y-=step;e.rotation=(step%4)*90;if(e.unit)e.unit.position=null;}
   index.refresh(current);
   const fresh=new TargetIndex(current,g.registry);
   for(let y=-30;y<85;y+=11)for(let x=-30;x<85;x+=13){
    const a=[...index.near({x,y},17)],b=[...fresh.near({x,y},17)];
    expect(a.map(e=>e.id)).toEqual(b.map(e=>e.id));
    for(let i=0;i<a.length;i++)expect(a[i]).toBe(b[i]);
   }
  }
  expect(before.every(e=>bodies.includes(e))).toBe(true);
 });
});

describe('blocked worker departure',()=>{
 it('rejects routing while overlapped by traffic, then routes immediately when traffic leaves',()=>{
  const g=game([placed('worker','unit.test.settler',205,210),placed('other','unit.test.warrior',205,210)]);
  const worker=g.entities.find(e=>e.placement==='worker')!,other=g.entities.find(e=>e.placement==='other')!;
  expect(g.spatial.route(worker,{x:200,y:225},true)).toBe(false);
  other.x=200;other.y=200;
  expect(g.spatial.route(worker,{x:200,y:225},true)).toBe(true);
  expect(worker.unit!.goal).toBe(g.spatial.cell({x:200,y:225}));
 });
});
