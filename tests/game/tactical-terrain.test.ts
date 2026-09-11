import {describe,it,expect} from 'vitest';
import {HeightField,encodeHeight,decodeHeight} from '../../src/shared/map/height';
import {TacticalTerrain} from '../../src/shared/map/tacticalTerrain';
import {sculptPlateau,sculptRamp} from '../../src/shared/landscape/tacticalAuthoring';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {Game} from '../../src/sim/game/game';
import {slots,placed,source,run,game} from './helpers';
import {ContentRegistry} from '../../src/content/registry';
import type {Rules} from '../../src/content/schema';
import {heading} from '../../src/sim/game/facing';
function terrain(){
 const f=new HeightField();f.samples.fill(1);f.waterLevel=0;
 sculptPlateau(f,[{x:110,z:90},{x:145,z:90},{x:145,z:145},{x:110,z:145}],5);
 return f;
}
function scenario(f=terrain()){
 const src=source();(src.rules as Rules).startingSetup.gathering=[];
 return new Game({...emptyUtcMap(),waterLevel:0,height:encodeHeight(f.samples),entities:[
  placed('low','unit.ants.archer',108,110),{...placed('high','unit.ants.warrior',110,110),owner:'player.2'},
  placed('scout','unit.ants.warrior',112,116)
 ]},slots,new ContentRegistry(src));
}
describe('tactical heights',()=>{
 it('authors a level cliff and a traversable ramp, without accumulating height on reapply',()=>{
  const f=terrain();expect(f.sample(109,110)).toBe(1);expect(f.sample(110,110)).toBe(5);
  const before=f.samples.slice();sculptPlateau(f,[{x:110,z:90},{x:145,z:90},{x:145,z:145},{x:110,z:145}],5);expect(f.samples).toEqual(before);
  sculptRamp(f,[{x:101,z:130},{x:121,z:130}],3);
  expect(f.sample(101,130)).toBe(1);expect(f.sample(121,130)).toBe(5);expect(f.sample(111,130)).toBeCloseTo(3);
  const g=scenario(f);
  expect(g.spatial.clearSegment({x:108000,y:110000},{x:113000,y:110000})).toBe(false);
  expect(g.spatial.clearSegment({x:101000,y:130000},{x:121000,y:130000})).toBe(true);
  expect(decodeHeight(encodeHeight(f.samples)!,256)).toEqual(f.samples);
 });
 it('rejects ramps too short for their rise before modifying any samples',()=>{
  const f=terrain(),before=f.samples.slice();expect(()=>sculptRamp(f,[{x:109,z:110},{x:111,z:110}],3)).toThrow('too steep');expect(f.samples).toEqual(before);
 });
 it('hides uphill targets, permits downhill sight, and progressively reveals while climbing',()=>{
  const g=scenario(),t=g.spatial.tactical;
  expect(t.visible({x:108,y:110},{x:110,y:110})).toBe(false);
  expect(t.visible({x:110,y:110},{x:108,y:110})).toBe(true);
  const f=terrain();sculptRamp(f,[{x:101,z:130},{x:121,z:130}],3);const ramp=scenario(f).spatial.tactical;
  expect(ramp.visible({x:110,y:130},{x:121,y:130})).toBe(false);
  expect(ramp.visible({x:116,y:130},{x:121,y:130})).toBe(true);
 });
 it('blocks shots through a ridge and melee over an edge even when target is visible to a scout',()=>{
  const g=scenario(),low=g.entities.find(e=>e.placement==='low')!,high=g.entities.find(e=>e.placement==='high')!;
  expect(g.observation.visible('player.1',high)).toBe(true);
  expect(g.spatial.attackClear(low,high,false)).toBe(false);
  expect(g.spatial.attackClear(low,high,true)).toBe(true);
  expect(g.spatial.tactical.shotClear({x:108,y:110},{x:148,y:110})).toBe(false);
  low.rotation=heading(low,high);
  const hp=high.hp!;expect(g.command('player.1',{type:'attack',actors:[low.id],target:high.id,force:false}).accepted).toBe(true);
  run(g,80);expect(high.hp).toBeLessThan(hp);
 });
 it('keeps explored terrain, hides current enemies after the scout leaves, and matches fog with perception',()=>{
  const g=scenario(),high=g.entities.find(e=>e.placement==='high')!,scout=g.entities.find(e=>e.placement==='scout')!;
  const cell=g.spatial.cell(high);expect(g.view('player.1').fog!.cells[cell]).toBe(2);
  scout.x=80;scout.y=80;scout.unit!.position={x:80000,y:80000};g.observation.update();
  expect(g.observation.visible('player.1',high)).toBe(false);
  expect(g.view('player.1').fog!.cells[cell]).toBe(1);
  expect(g.view('player.1').entities.some(e=>e.id===high.id)).toBe(false);
 });
 it('has bounded reusable views and leaves flat-ground sight unchanged',()=>{
  const t=new TacticalTerrain(32,new Int16Array(32*32));
  const cells=t.visibleCells({x:16,y:16},4);expect(cells).toHaveLength(49);
  expect(t.visibleCells({x:16,y:16},4)).toBe(cells);
  for(let i=0;i<300;i++)t.visibleCells({x:i%32,y:Math.floor(i/32)},3);
  expect(t.visibleCells({x:16,y:16},4)).toEqual(cells);
 });
});
it('shares allied cliff-top vision without granting it to another team',()=>{
 const map={...emptyUtcMap(),waterLevel:0,height:encodeHeight(terrain().samples),playerStarts:[
  {player:1,x:38,z:38,setup:'setup.ants',mainFort:'start.player.1/main-fort'},
  {player:2,x:218,z:218,setup:'setup.ants',mainFort:'start.player.2/main-fort'},
  {player:3,x:38,z:218,setup:'setup.ants',mainFort:'start.player.3/main-fort'}],entities:[
  placed('low','unit.ants.archer',108,110),{...placed('ally','unit.ants.warrior',112,116),owner:'player.2' as const},
  {...placed('enemy','unit.ants.warrior',112,110),owner:'player.3' as const}]};
 const g=new Game(map,[{player:0,kind:'human',team:1},{player:1,kind:'human',team:1},{player:2,kind:'human',team:2}]);
 const enemy=g.entities.find(e=>e.placement==='enemy')!,ally=g.entities.find(e=>e.placement==='ally')!;
 expect(g.observation.visible('player.1',enemy)).toBe(true);
 ally.x=80;ally.y=80;ally.unit!.position={x:80000,y:80000};g.observation.update();
 expect(g.observation.visible('player.1',enemy)).toBe(false);
 const copy=new Game(map,g.slots);copy.restore(g.snapshot());run(g,20);run(copy,20);expect(copy.snapshot()).toEqual(g.snapshot());
});

it('keeps remembered trees immutable while visible harvest changes refresh immediately',()=>{
 const g=game([placed('scout','unit.ants.warrior',110,110),
  {...placed('tree','resource.forest.tree',112,110),owner:'none'}]);
 const scout=g.entities.find(e=>e.placement==='scout')!,tree=g.entities.find(e=>e.placement==='tree')!;
 const read=()=>g.view('player.1').entities.find(e=>e.id===tree.id)!;
 const original=read(),originalAmount=original.resource!.amount;
 expect(g.view().entities.find(e=>e.id===tree.id)).toMatchObject({inventory:{},job:'Available',resource:{amount:originalAmount}});
 tree.resource!.felling!.hp=9;tree.resource!.felling!.lastHitTick=0;g.observation.update();
 expect(read().resource!.felling!.hp).toBe(9);expect(original.resource!.felling!.hp).toBe(10);
 scout.x=80;scout.y=80;scout.unit!.position={x:80000,y:80000};g.observation.update();
 tree.resource!.amount=0;tree.resource!.felling!.hp=0;tree.resource!.felling!.fallTick=0;g.observation.update();
 expect(read().remembered).toBe(true);expect(read().resource!.amount).toBe(originalAmount);expect(read().resource!.felling!.hp).toBe(9);
 scout.x=110;scout.y=110;scout.unit!.position={x:110000,y:110000};g.observation.update();
 expect(read().remembered).not.toBe(true);expect(read().resource!.amount).toBe(0);expect(read().resource!.felling!.hp).toBe(0);
 const saved=g.snapshot();g.restore(saved);expect(g.snapshot()).toEqual(saved);
 g.economy.remove(g.context.get(tree.id)!);g.observation.update();expect(read()).toBeUndefined();
});
