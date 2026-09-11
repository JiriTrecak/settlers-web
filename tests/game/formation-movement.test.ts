import {expect,it} from 'vitest';
import {game,placed} from './helpers';
import {precise,fixed} from '../../src/sim/game/motion';

it.each([{x:6,y:0},{x:0,y:6},{x:6,y:6},{x:-6,y:0}])('moves a compact 12-unit army without reorganizing it on clear ground: %j',offset=>{
 const placements=Array.from({length:12},(_,i)=>{const p=placed(`army-${i}`,'unit.ants.warrior',100+i%4,100+Math.floor(i/4));p.rotation=90;return p;});
 const g=game(placements),army=g.entities.filter(e=>e.placement?.startsWith('army-'));
 const starts=new Map(army.map(e=>[e.id,{x:e.x,y:e.y}])),first=new Map<number,number>();
 g.command('player.1',{type:'move',actors:army.map(e=>e.id),destination:{x:102+offset.x,y:101+offset.y}});
 for(let tick=1;tick<=110;tick++){
  const before=army.map(e=>fixed(precise(e)));g.tick();
  army.forEach((e,i)=>{
   const after=fixed(precise(e)),travel=Math.hypot(after.x-before[i].x,after.y-before[i].y);
   if(travel>0&&!first.has(e.id))first.set(e.id,tick);
   expect(travel).toBeLessThanOrEqual(102);
   expect(g.spatial.clearSegment(before[i],after)).toBe(true);
   for(const other of army)if(other!==e)expect(Math.hypot(precise(e).x-precise(other).x,precise(e).y-precise(other).y)).toBeGreaterThanOrEqual(.399);
  });
 }
 expect(first.size).toBe(12);expect(Math.max(...first.values())).toBeLessThanOrEqual(10);
 for(const e of army){const start=starts.get(e.id)!;expect(precise(e)).toMatchObject({x:start.x+offset.x,y:start.y+offset.y});expect(e.unit!.order).toBeNull();}
});

it('replaces a moving formation immediately and replays the reversal deterministically',()=>{
 const placements=Array.from({length:12},(_,i)=>{const p=placed(`army-${i}`,'unit.ants.warrior',100+i%4,100+Math.floor(i/4));p.rotation=90;return p;});
 const g=game(placements),army=g.entities.filter(e=>e.placement?.startsWith('army-')),ids=army.map(e=>e.id);
 g.command('player.1',{type:'move',actors:ids,destination:{x:126,y:101}});
 for(let n=0;n<40;n++)g.tick();
 const before=army.map(e=>({position:{...precise(e)},rotation:e.rotation}));
 const copy=game(placements);copy.restore(g.snapshot());
 const reverse={type:'move' as const,actors:ids,destination:{x:78,y:101}};
 expect(g.command('player.1',reverse).accepted).toBe(true);
 expect(copy.command('player.1',{...reverse,actors:[...ids].reverse()}).accepted).toBe(true);
 g.tick();copy.tick();expect(g.checksum()).toBe(copy.checksum());
 army.forEach((e,i)=>{expect(e.rotation).not.toBe(before[i].rotation);expect(precise(e)).toMatchObject(before[i].position);});
 for(let n=0;n<380;n++){g.tick();copy.tick();expect(g.checksum()).toBe(copy.checksum());}
 expect(army.every(e=>!e.unit!.order)).toBe(true);
});
