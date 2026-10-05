import {expect,it,vi} from 'vitest';
import {game,placed} from './helpers';

it('reuses unchanged sight footprints but follows placement, shape and floor identity changes',()=>{
 const g=game([placed('scout','unit.ants.warrior',80,90),{...placed('enemy','building.ants.house',85,90),owner:'player.2'}],s=>{
  s.definitions.find(d=>d.id==='building.ants.house')!.footprint={width:7,depth:3};
 });
 const e=g.entities.find(e=>e.placement==='enemy')!,s=g.spatial,observer=g.observation;
 observer.update();const footprint=vi.spyOn(s,'footprint');
 const check=()=>{
  const expected=s.footprint(e).some(cell=>cell>=0&&observer.currentlyVisible('player.1',[cell]));footprint.mockClear();
  expect(observer.previouslyVisible('player.1',e)).toBe(expected);
  footprint.mockClear();expect(observer.previouslyVisible('player.1',e)).toBe(expected);expect(footprint).not.toHaveBeenCalled();
 };
 check();e.x+=20;check();e.rotation=90;check();e.y-=15;check();e.definition='unit.ants.warrior';check();e.surface='changed';check();delete e.surface;check();
 footprint.mockRestore();
});
