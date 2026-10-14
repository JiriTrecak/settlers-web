import {expect,it,vi} from 'vitest';
import {game,placed,worker} from './helpers';
import {fixed} from '../../src/sim/game/motion';

it('matches live body queries when builders choose work points around parked and yielding units',()=>{
 const placements=Array.from({length:12},(_,i)=>placed('parked'+i,'unit.ants.warrior',173+i%6*6,194+Math.floor(i/6)*30));
 const cached=game(placements),live=game(placements);
 const queries=vi.spyOn(live.spatial,'withLocalUnitClearance').mockImplementation((_origin,_extent,id,query)=>
  query((from,to)=>live.spatial.unitSegmentClear(from,to,id)));
 for(const g of [cached,live]){
  const w=worker(g);
  expect(g.command('player.1',{type:'build',actors:[w.id],definition:'building.ants.barracks',position:{x:189.5,y:209.5}}).accepted).toBe(true);
 }
 for(let tick=0;tick<240;tick++){
  if(tick===80||tick===160)for(const g of [cached,live]){
   const parked=g.entities.find(e=>e.placement==='parked0')!;
   const p={x:185,y:205},cell=g.spatial.cell(p);
   if(tick===80)parked.unit!.detour={goal:cell,waypoint:cell,points:[fixed(p)],yielding:{leader:worker(g).id,until:g.state.tick+100}};
   else{parked.hp=0;delete parked.unit!.detour;}
  }
  cached.tick();live.tick();
  expect(cached.snapshot()).toEqual(live.snapshot());
 }
 expect(queries).toHaveBeenCalled();
});
