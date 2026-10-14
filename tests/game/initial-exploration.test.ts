import {expect,it} from 'vitest';
import {Game} from '../../src/sim/game/game';
import {World} from '../../src/sim/world/world';
import {emptyUtcMap,initialExploration,parseUtcMap,readUtcMap,stringifyUtcMap} from '../../src/shared/map/utcmap';
import {mapRevision} from '../../src/shared/map/playable';
import {entityAuthoringState,restoreEntityAuthoring} from '../../src/editor/world/entityAuthoring';
import {missionFixture} from '../sim/mission-fixture';
import {slots,placed} from './helpers';
import {testContent} from '../fixtures/content';

it('defaults skirmishes to explored and campaigns to hidden, with saved per-map overrides',()=>{
 const skirmish=emptyUtcMap(),mission=missionFixture('function on_start() end');
 expect(initialExploration(skirmish)).toBe('explored');expect(initialExploration(mission)).toBe('hidden');
 for(const base of [skirmish,mission])for(const value of ['hidden','explored'] as const){
  const map={...base,initialExploration:value},parsed=parseUtcMap(JSON.parse(stringifyUtcMap(map)))!;
  expect(parsed.initialExploration).toBe(value);expect(initialExploration(parsed)).toBe(value);
  expect(mapRevision(map)).not.toBe(mapRevision(base));
 }
 expect(readUtcMap({...skirmish,initialExploration:'visible'})).toEqual({error:'initialExploration: must be explored or hidden'});
});

it('keeps exploration in editor undo without overwriting later terrain edits',()=>{
 const map=emptyUtcMap(),before=entityAuthoringState(map);
 const changed={...map,initialExploration:'hidden' as const,name:'Renamed'};
 expect(restoreEntityAuthoring(changed,before)).toEqual({...map,name:'Renamed',mission:undefined,initialExploration:undefined});
});

it.each(['hidden','explored'] as const)('starts %s without revealing enemy units, structures or targeting information',initialExploration=>{
 const g=new Game({...emptyUtcMap(),initialExploration},slots,testContent);
 const enemy=g.entities.find(e=>e.owner==='player.2'&&g.registry.get(e.definition).kind==='building')!;
 const scout=g.entities.find(e=>e.owner==='player.1'&&e.unit)!;
 const view=g.view('player.1'),remote=g.spatial.cell(enemy);
 expect(view.fog!.cells[remote]).toBe(initialExploration==='explored'?1:0);
 expect(view.entities.some(e=>e.owner==='player.2')).toBe(false);
 expect(g.observation.visible('player.1',enemy)).toBe(false);
 expect(g.observation.currentlyVisible('player.1',[remote])).toBe(false);
 expect(g.command('player.1',{type:'attack',actors:[scout.id],target:enemy.id,force:false}).accepted).toBe(false);
 // Real sight reveals entities; leaving sight preserves only a last-seen building.
 scout.x=enemy.x+14;scout.y=enemy.y;scout.unit!.position={x:scout.x*1000,y:scout.y*1000};
 g.observation.update();expect(g.view('player.1').fog!.cells[remote]).toBe(2);
 expect(g.view('player.1').entities.some(e=>e.id===enemy.id)).toBe(true);
 scout.x=180;scout.y=180;scout.unit!.position={x:180000,y:180000};g.observation.update();
 expect(g.view('player.1').fog!.cells[remote]).toBe(1);
 expect(g.view('player.1').entities.find(e=>e.id===enemy.id)?.remembered).toBe(true);
 expect(g.observation.visible('player.1',enemy)).toBe(false);
});

it('starts campaign terrain hidden unless its map explicitly opts into exploration',()=>{
 for(const explored of [false,true]){
  const map={...missionFixture('function on_start() end'),...(explored?{initialExploration:'explored' as const}:{})};
  const g=new Game(map,[slots[0]],testContent);
  expect(g.view('player.1').fog!.cells[0]).toBe(explored?1:0);
 }
});

it.each(['hidden','explored'] as const)('preserves %s knowledge through independent deterministic runs and save continuation',initialExploration=>{
 const options={map:{...emptyUtcMap(),initialExploration},slots,seed:103,registry:testContent},a=new World(options),b=new World(options);
 for(let i=0;i<12;i++){a.tick();b.tick();expect(a.checksum('full')).toBe(b.checksum('full'));}
 b.restore(a.snapshot());
 for(let i=0;i<12;i++){a.tick();b.tick();expect(a.checksum('full')).toBe(b.checksum('full'));}
 expect(b.snapshot()).toEqual(a.snapshot());
 expect(b.view(0).settlement.fog!.cells[0]).toBe(initialExploration==='explored'?1:0);
});

it('surveys neutral resources once without exposing later out-of-sight harvesting or removal',()=>{
 const map={...emptyUtcMap(),entities:[
  {...placed('remote-mine','building.test.neutral-amber-mine',125.5,125.5),owner:'none' as const},
  {...placed('remote-tree','resource.test.forest-tree',140,140),owner:'none' as const},
 ]};
 const g=new Game(map,slots,testContent),mine=g.entities.find(e=>e.placement==='remote-mine')!,tree=g.entities.find(e=>e.placement==='remote-tree')!;
 const first=g.view('player.1').entities.find(e=>e.id===mine.id)!;
 expect(first.remembered).toBe(true);expect(first.resource!.amount).toBeGreaterThan(0);
 expect(g.view('player.1').entities.find(e=>e.id===tree.id)?.remembered).toBe(true);
 mine.resource!.amount-=10;g.context.remove(tree);g.observation.update();
 expect(g.view('player.1').entities.find(e=>e.id===mine.id)!.resource!.amount).toBe(first.resource!.amount);
 expect(g.view('player.1').entities.find(e=>e.id===tree.id)).toBeDefined();
 const saved=g.snapshot(),copy=new Game(map,slots,testContent);copy.restore(saved);
 expect(copy.view('player.1')).toEqual(g.view('player.1'));
 const hidden=new Game({...map,initialExploration:'hidden'},slots,testContent);
 expect(hidden.view('player.1').entities.some(e=>e.owner==='none')).toBe(false);
});

it('still rejects construction on hidden terrain when the map opts out of exploration',()=>{
 const g=new Game({...emptyUtcMap(),initialExploration:'hidden'},slots,testContent);
 expect(g.canBuild('player.1','building.test.house',{x:163.5,y:163.5},g.entities.find(e=>e.owner==='player.1'&&g.registry.get(e.definition).behaviors.work)!.id)).toMatch(/Explore/);
});
