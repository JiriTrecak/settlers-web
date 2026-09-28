/** Forest trees are drawn with ground-level branch skirts several cells wide, so their
 * movement disc must join neighbours into a wall instead of leaving walkable lanes. */
import {expect,it} from 'vitest';
import {Game} from '../../src/sim/game/game';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {precise} from '../../src/sim/game/motion';
import {placed} from './helpers';

it('routes around a row of trees spaced wider than forest spacing instead of between trunks',()=>{
 const base=emptyUtcMap(),row=Array.from({length:7},(_,i)=>placed(`tree.${i}`,'resource.forest.tree',92+i*4,100));
 const map={...base,playerStarts:base.playerStarts.map((s,i)=>({...s,x:200,z:i?60:200})),entities:[...row,placed('walker','unit.ants.warrior',104,94)]};
 const g=new Game(map,[{player:0,kind:'human'},{player:1,kind:'human'}]);
 const walker=g.entities.find(e=>e.placement==='walker')!,trees=g.entities.filter(e=>e.resource);
 for(let x=92;x<=116;x++)expect(g.spatial.walkable(g.spatial.cell({x,y:100})),`gap at ${x}`).toBe(false);
 expect(g.command('player.1',{type:'move',actors:[walker.id],destination:{x:104,y:106}}).accepted).toBe(true);
 let closest=Infinity,crossedAt:number|undefined;
 for(let t=0;t<900;t++){
  const before=precise(walker);g.tick();const p=precise(walker);
  if(before.y<100&&p.y>=100)crossedAt=p.x;
  for(const tree of trees)closest=Math.min(closest,Math.hypot(p.x-tree.x,p.y-tree.y));
 }
 expect(precise(walker)).toEqual({x:104,y:106});
 expect(crossedAt!<92-2||crossedAt!>116+2).toBe(true);
 expect(closest).toBeGreaterThan(2);
});
