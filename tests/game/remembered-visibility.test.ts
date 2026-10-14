import {expect,it} from 'vitest';
import {game,placed} from './helpers';

it('previous-visibility memory follows placement, shape and floor identity changes',()=>{
 const g=game([placed('scout','unit.test.warrior',76,90),{...placed('enemy','building.test.house',85,90),owner:'player.2',position:{x:83.5,y:89.5}}],s=>{
  (s.definitions as {id:string;footprint?:{width:number;depth:number};entrance?:{x:number;y:number}}[]).find(d=>d.id==='building.test.house')!.footprint={width:8,depth:4};
  (s.definitions as {id:string;entrance?:{x:number;y:number}}[]).find(d=>d.id==='building.test.house')!.entrance={x:.5,y:2.5};
 });
 const e=g.entities.find(e=>e.placement==='enemy')!,s=g.spatial,observer=g.observation;
 observer.update();
 const check=()=>{
  const expected=s.footprint(e).some(cell=>cell>=0&&observer.currentlyVisible('player.1',[cell]));
  expect(observer.previouslyVisible('player.1',e)).toBe(expected);
  expect(observer.previouslyVisible('player.1',e)).toBe(expected);
 };
 check();e.x+=20;check();e.rotation=90;check();e.y-=15;check();e.definition='unit.test.warrior';check();e.surface='changed';check();delete e.surface;check();
});
