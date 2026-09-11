import {expect,it} from 'vitest';
import {game,placed} from './helpers';
import {atPoint,fixed,precise} from '../../src/sim/game/motion';

function fixture(rotation=0) {
  const rotate=(x:number,y:number)=>{
    for(let i=0;i<rotation;i++)[x,y]=[256-y,x];
    return {x,y};
  };
  const start=rotate(127,121),destination=rotate(134,121);
  const g=game([placed('mover','unit.ants.warrior',start.x,start.y)]);
  const mover=g.entities.find(e=>e.placement==='mover')!;
  const position=rotate(127.213,120.621);
  mover.unit!.position={x:Math.round(position.x*1000),y:Math.round(position.y*1000)};
  for(let y=1;y<256;y++)if(y!==121){const p=rotate(128,y);g.spatial.terrain[g.spatial.cell(p)]=0;}
  return {g,mover,start,destination};
}

it.each([0,1,2,3])('connects a mid-cell position to the A* corridor around a corner (rotation %i)',rotation=>{
  const {g,mover,start,destination}=fixture(rotation);
  const before={...mover.unit!.position!};
  expect(g.spatial.clearSegment(before,before)).toBe(true);
  const coarse=g.spatial.navigation.path(g.spatial.cell(start),g.spatial.cell(destination))!;
  expect(coarse).not.toBeNull();
  expect(g.spatial.clearSegment(before,fixed(g.spatial.point(coarse[0])))).toBe(false);
  expect(g.spatial.route(mover,destination,false)).toBe(true);
  expect(mover.unit!.position).toEqual(before);
  expect(mover.unit!.route[0]).toBe(g.spatial.cell(start));
  mover.unit!.order={type:'move',destination,attackMove:false};
  for(let i=0;i<240&&mover.unit!.order;i++){
    const previous={...mover.unit!.position!};g.tick();
    expect(g.spatial.clearSegment(previous,mover.unit!.position!)).toBe(true);
    expect(Math.hypot(mover.unit!.position!.x-previous.x,mover.unit!.position!.y-previous.y)).toBeLessThanOrEqual(g.context.def(mover).behaviors.movement!.speed*1000/40+1.5);
  }
  expect(atPoint(mover,destination)).toBe(true);
  expect(mover.unit!.order).toBeNull();
});

it('retains an existing route when traffic blocks the center connection',()=>{
  const {g,mover,start,destination}=fixture();
  g.context.create(placed('hold','unit.ants.warrior',start.x,start.y));
  mover.unit!.route=[g.spatial.cell({x:125,y:120})];
  const before=structuredClone(mover.unit);
  expect(g.spatial.route(mover,destination,true)).toBe(false);
  expect(mover.unit).toEqual(before);
});

it('replays the connector identically and interrupts it immediately on Stop',()=>{
  const {g,mover,destination}=fixture();
  expect(g.command('player.1',{type:'move',actors:[mover.id],destination}).accepted).toBe(true);
  for(let i=0;i<3;i++)g.tick();
  const {g:restored}=fixture();restored.restore(g.snapshot());
  for(let i=0;i<30;i++){g.tick();restored.tick();expect(restored.checksum()).toBe(g.checksum());}
  const before={...precise(mover)};
  g.command('player.1',{type:'stop',actors:[mover.id]});g.tick();
  expect(precise(mover)).toMatchObject(before);expect(mover.unit!.route).toEqual([]);
});
