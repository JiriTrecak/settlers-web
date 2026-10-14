import {expect,it} from 'vitest';
import {fixed,precise} from '../../src/sim/game/motion';
import {game,placed} from './helpers';

it.each([0,1,2,3])('moves a group around terrain without overlap and replays identically after a cold restore, rotation %i',rotation=>{
 const turn=(x:number,y:number)=>{for(let n=0;n<rotation;n++)[x,y]=[255-y,x];return{x,y};};
 const placements=Array.from({length:8},(_,i)=>{const p=turn(40+i%2*3,74+Math.floor(i/2)*3);return placed(`army-${i}`,'unit.test.warrior',p.x,p.y);});
 // Direct fixture terrain edits must invalidate the mesh prepared at load.
 const terrain=(g:ReturnType<typeof game>)=>{for(let y=62;y<=95;y++)g.spatial.terrain[g.spatial.cell(turn(75,y))]=0;g.spatial.rebuild();};
 const g=game(placements),replica=game(placements);terrain(g);terrain(replica);
 const army=g.entities.filter(e=>e.placement?.startsWith('army-')),ids=army.map(e=>e.id);
 const destination=turn(130,82);
 for(const world of [g,replica])expect(world.command('player.1',{type:'move',actors:ids,destination}).accepted).toBe(true);
 for(let tick=0;tick<1000;tick++){
  if(tick===100){replica.restore(g.snapshot());terrain(replica);}
  const before=army.map(e=>fixed(precise(e)));
  g.tick();replica.tick();expect(g.checksum()).toBe(replica.checksum());
  for(let i=0;i<army.length;i++){
   expect(g.spatial.clearSegment(before[i],fixed(precise(army[i])),undefined,army[i])).toBe(true);
   for(let j=0;j<i;j++)expect(Math.hypot(precise(army[i]).x-precise(army[j]).x,precise(army[i]).y-precise(army[j]).y))
    .toBeGreaterThanOrEqual(g.spatial.unitRadius*2/1000-.001);
  }
 }
 expect(army.every(e=>e.unit!.order===null)).toBe(true);
 for(const e of army)expect(Math.hypot(e.x-destination.x,e.y-destination.y)).toBeLessThan(12);
},20000);
