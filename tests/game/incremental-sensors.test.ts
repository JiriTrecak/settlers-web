import {expect,it,vi} from 'vitest';
import {game,placed} from './helpers';
import {heading} from '../../src/sim/game/facing';
import type {Entity} from '../../src/sim/game/state';

const setup=()=>game([
 placed('scout','unit.ants.warrior',100,100),
 {...placed('target','unit.ants.warrior',145,100),owner:'player.2'},
 ...Array.from({length:120},(_,i)=>placed('idle'+i,'unit.ants.warrior',20+i%12*8,180+Math.floor(i/12)*6)),
]);
const actor=(g:ReturnType<typeof game>,id:string)=>g.entities.find(e=>e.placement===id)!;
const sight=(g:ReturnType<typeof game>)=>g.observation.visible('player.1',actor(g,'target'));

it('updates moved sensors between phases without revisiting stationary sensors',()=>{
 const fast=setup(),reference=setup();
 // Independent broad-phase oracle: always supply every live sensor; all real
 // visibility, ownership, range and terrain tests still run normally.
 vi.spyOn(reference.observation as unknown as {nearbySensors(e:Entity):Iterable<Entity>},'nearbySensors').mockImplementation(()=>reference.context.liveSensors());
 for(const g of [fast,reference]){
  g.state.tick=10;const scout=actor(g,'scout'),goal={x:120,y:99};
  scout.rotation=heading(scout,goal);g.spatial.route(scout,goal,false);
 }
 expect(sight(fast)).toBe(sight(reference));
 expect(sight(fast)).toBe(false);
 const scans=vi.spyOn(fast.context,'liveSensors');let becameVisible=false;
 for(let step=0;step<100;step++){
  fast.context.move();reference.context.move();
  const visible=sight(fast);expect(visible).toBe(sight(reference));becameVisible||=visible;
  expect(fast.checksum('full')).toBe(reference.checksum('full'));
 }
 expect(becameVisible).toBe(true);expect(scans).not.toHaveBeenCalled();
});

it('reconciles untracked motion, membership, tick-boundary lifecycle changes and explicit editor edits',()=>{
 const g=setup(),scout=actor(g,'scout'),target=actor(g,'target');g.state.tick=10;
 expect(sight(g)).toBe(false);
 const scans=vi.spyOn(g.context,'liveSensors');
 scout.x=119;g.context.motionRevision++;expect(sight(g)).toBe(true);expect(scans).toHaveBeenCalledTimes(1);
 scout.hp=0;g.state.tick++;expect(sight(g)).toBe(false);expect(scans).toHaveBeenCalledTimes(2);
 scout.hp=100;g.state.tick++;expect(sight(g)).toBe(true);
 scout.x=100;g.observation.update();expect(sight(g)).toBe(false);
 const added=g.context.create(placed('new-scout','unit.ants.warrior',target.x-1,target.y));
 expect(sight(g)).toBe(true);g.context.remove(added);expect(sight(g)).toBe(false);
 // A later tracked movement pass must not hide an earlier untracked mutation.
 scout.x=119;g.context.motionRevision++;g.context.move();expect(sight(g)).toBe(true);
 const saved=g.snapshot(),copy=setup();copy.restore(saved);expect(sight(copy)).toBe(sight(g));
});

it('does not reinsert a removed sensor from an earlier movement receipt in the same tick',()=>{
 const g=setup(),scout=actor(g,'scout');g.state.tick=10;
 scout.x=119;g.context.motionRevision++;expect(sight(g)).toBe(true);
 scout.rotation=90;g.spatial.route(scout,{x:125,y:100},false);g.context.move();expect(sight(g)).toBe(true);
 g.context.remove(scout);expect(sight(g)).toBe(false);
 g.context.move();expect(sight(g)).toBe(false);
});
