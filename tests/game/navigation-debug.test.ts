/** The debug navigation snapshot mirrors what pathing sees: blocked cells by cause and the
 * route a moving unit will actually walk. */
import {expect,it} from 'vitest';
import {Game} from '../../src/sim/game/game';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {NAV_CELL,navigationPaths,walkabilityCells} from '../../src/sim/game/navigationDebug';
import {placed} from './helpers';

it('classifies tree discs as resource cells and draws a moving unit route to its goal',()=>{
 const base=emptyUtcMap();
 const map={...base,playerStarts:base.playerStarts.map((s,i)=>({...s,x:200,z:i?60:200})),entities:[placed('tree','resource.forest.tree',100,100),placed('walker','unit.ants.warrior',100,94)]};
 const g=new Game(map,[{player:0,kind:'human'},{player:1,kind:'human'}]);
 const walker=g.entities.find(e=>e.placement==='walker')!,s=g.spatial;
 const cells=walkabilityCells(g);
 expect(cells.length).toBe(s.size*s.size);
 expect(cells[s.cell({x:101,y:101})]).toBe(NAV_CELL.resource);
 expect(cells[s.cell({x:100,y:90})]).toBe(NAV_CELL.walkable);
 expect(navigationPaths(g,null,null)).toEqual([]);
 const revision=s.revision;
 expect(g.command('player.1',{type:'move',actors:[walker.id],destination:{x:100,y:106}}).accepted).toBe(true);
 g.tick();
 const [path]=navigationPaths(g,null,null);
 expect(path?.id).toBe(walker.id);
 expect(path!.points.slice(-3)).toEqual([100,expect.any(Number),106]);
 expect(navigationPaths(g,null,walker.owner==='player.1'?'player.2':'player.1')).toEqual([]);
 expect(s.revision).toBeGreaterThanOrEqual(revision);
});
