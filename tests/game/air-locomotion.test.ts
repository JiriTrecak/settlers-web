import {describe,it,expect} from 'vitest';
import {game,placed} from './helpers';
import type {Definition} from '../../src/content/schema';
import {fixed,precise} from '../../src/sim/game/motion';
import {heading} from '../../src/sim/game/facing';
import {matchesTargetFilter} from '../../src/content/abilities/conditions';
function setup(){
 const g=game([placed('flyer','unit.ants.archer',100,100),{...placed('ground','unit.ants.warrior',105,100),owner:'player.2'}],s=>{const d=s.definitions.find(d=>(d as Definition).id==='unit.ants.archer') as Definition;d.behaviors.movement={speed:6,turnRate:720,locomotion:'air',flightHeight:6};});
 return {g,a:g.entities.find(e=>e.placement==='flyer')!,b:g.entities.find(e=>e.placement==='ground')!};
}
describe('air locomotion',()=>{
 it('crosses impassable ground and resource/building occupancy but stays inside the map',()=>{
  const {g,a,b}=setup(),s=g.context.spatial;
  for(let y=0;y<s.size;y++){s.occupied[y*s.size+103]=999;s.resources[y*s.size+104]=998;s.heights[y*s.size+103]=5000;}
  expect(s.clearSegment(fixed({x:100,y:100}),fixed({x:110,y:100}),undefined,b)).toBe(false);
  expect(s.route(a,{x:110,y:100})).toBe(true);expect(a.unit!.route).toEqual([100*s.size+110]);
  expect(s.clearSegment(fixed(a),fixed({x:-1,y:100}),undefined,a)).toBe(false);
  expect(s.route(a,{x:s.size,y:100})).toBe(false);
 });
 it('shares a horizontal position with ground units but collides with other flyers',()=>{
  const {g,a,b}=setup(),s=g.context.spatial;b.x=a.x;b.y=a.y;b.unit!.position=fixed(a);
  expect(s.free(a,a.id,a)).toBe(true);expect(s.unitSegmentClear(fixed(a),fixed(a),a.id)).toBe(true);
  const other=g.context.create(placed('other','unit.ants.archer',a.x,a.y));
  expect(s.free(a,a.id,a)).toBe(false);expect(s.unitSegmentClear(fixed(a),fixed(a),a.id)).toBe(false);
  expect(other.definition).toBe(a.definition);
 });
 it('moves over grounded units identically after snapshot restore',()=>{
  const {g,a}=setup();a.rotation=heading(a,{x:110,y:100});expect(g.context.spatial.route(a,{x:110,y:100})).toBe(true);
  for(let i=0;i<7;i++)g.context.move();const other=setup().g;other.restore(g.snapshot());
  for(let i=0;i<140;i++){g.context.move();other.context.move();expect(other.checksum()).toBe(g.checksum());}
  expect(precise(a)).toMatchObject({x:110,y:100});
 });
 it('rejects ground-only melee attacks against air and releases missiles at air height',()=>{
  const {g,a,b}=setup();expect(g.command('player.2',{type:'attack',actors:[b.id],target:a.id}).accepted).toBe(false);
  a.rotation=heading(a,b);a.unit!.target=b.id;g.combat.resolve();expect(a.unit!.attack).toBeTruthy();
  g.state.tick=a.unit!.attack!.impact;g.combat.resolve();expect(g.state.missiles[0].origin.elevation).toBe(6);
  const save=g.snapshot();g.restore(save);expect(g.snapshot()).toEqual(save);
 });
 it('samples flight floor at the precise position without copying unrelated entity state',()=>{
  const {g,a,b}=setup(),s=g.spatial;
  a.unit!.position=fixed({x:100.6,y:100});
  s.waterHeights[100*s.size+101]=1200;
  a.unit!.garrison={building:999,height:3};
  const position=precise(a),expected=s.elevation({...a,...position})+3;
  expect(s.elevatedPoint(a)).toEqual({...position,elevation:expected});
  expect(expected).toBe(21);
  // Presentation metadata has no role in physical sight elevation.
  Object.defineProperty(a,'appearance',{enumerable:true,get(){throw Error('Unrelated entity property copied');}});
  expect(s.elevatedPoint(a)).toEqual({...position,elevation:expected});
  b.unit!.position=fixed({x:104.8,y:100});b.unit!.garrison={building:999,height:4};
  expect(s.elevatedPoint(b)).toEqual({...precise(b),elevation:4});
 });
 it('exposes flight elevation and handles explicit target classes',()=>{
  const {g,a}=setup();g.observation.update();expect(g.view('player.1').entities.find(e=>e.id===a.id)?.elevation).toBe(6);
  expect(matchesTargetFilter({locomotion:'air'},{locomotion:['ground']})).toBe(false);
  expect(matchesTargetFilter({locomotion:'air'},{locomotion:['air']})).toBe(true);
  expect(matchesTargetFilter({},{locomotion:['air']})).toBe(false);
 });
});
