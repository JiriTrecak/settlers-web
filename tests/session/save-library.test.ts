import {PresentationView} from '../../src/session/session/presentationView';
import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {savesForMode,validateSaveDestination,type SavedGame} from '../../src/shared/save/saveLibrary';
import {restoreSavedWorld} from '../../src/session/session/restoreSavedWorld';
import type {LocalSave} from '../../src/shared/save/localSave';
import {World} from '../../src/sim/world/world';
import {emptyUtcMap,parseUtcMap} from '../../src/shared/map/utcmap';
import {localMatch} from '../../src/shared/match/match';
import {emptyPipeline} from '../../src/shared/save/save';
import type {MapEntry} from '../../src/shared/map/library';
function fixture(campaign=false){
 const source=campaign?parseUtcMap(JSON.parse(readFileSync('assets/maps/campaign/vanguard-prologue.utcmap','utf8')))!:emptyUtcMap();
 const map={...source,entities:source.entities.filter(e=>!campaign||!e.id.startsWith('tree.'))};
 const match=localMatch({mapId:campaign?'mission':'map',mapRevision:'rev',seed:19,slotCount:campaign?1:2,me:0});
 const world=new World({map,slots:match.slots,seed:match.seed});for(let i=0;i<15;i++)world.tick();
 if(campaign)for(let i=0;i<600&&!world.settlement.state.mission?.dialogue?.remaining;i++)world.tick();
 const tick=world.clock.tickIndex;
 const entry:MapEntry={id:match.mapId,name:map.name,map,revision:'rev',players:match.slots.length,source:'project'};
 const save:LocalSave={v:4,remote:false,mode:campaign?'campaign':'skirmish',player:0,match,mapId:match.mapId,mapRevision:'rev',seed:19,world:world.snapshot(),pipeline:emptyPipeline(tick,match.slots),clients:match.slots.map(s=>({player:s.player,sentThrough:tick+1,outbox:[]}))};
 return {entry,save,world};
}
describe('mode-scoped local saves',()=>{
 it('lists only the requested mode, newest first',()=>{
  const a=fixture(),b=fixture(true);
  const row=(id:string,savedAt:number,data:LocalSave):SavedGame=>({id,savedAt,data,name:id,mapName:id});
  const records=[row('older',1,a.save),row('campaign',3,b.save),row('newer',2,a.save)];
  expect(savesForMode(records,'skirmish').map(s=>s.id)).toEqual(['newer','older']);
  expect(savesForMode(records,'campaign').map(s=>s.id)).toEqual(['campaign']);
  expect(records[0].id).toBe('older');
 });
 it('rejects wrong modes, forged mode flags, changed maps and inconsistent match metadata',()=>{
  const {entry,save}=fixture(true);
  expect(validateSaveDestination(save,'campaign',entry).player).toBe(0);
  expect(()=>validateSaveDestination(save,'skirmish',entry)).toThrow(/Only skirmish/);
  expect(()=>validateSaveDestination({...save,mode:'skirmish'},'skirmish',entry)).toThrow(/Only skirmish/);
  expect(()=>validateSaveDestination(save,'campaign',{...entry,revision:'changed'})).toThrow(/revision/);
  expect(()=>validateSaveDestination({...save,seed:20},'campaign',entry)).toThrow(/metadata/);
  expect(()=>validateSaveDestination({...save,player:null},'campaign',entry)).toThrow(/assignment/);
 });
 it('reveals the cinematic set without changing exploration or authoritative state',()=>{
  const {world}=fixture(true),projection=new PresentationView(),before=world.checksum();
  const normal=world.view(0),cells=normal.settlement.fog!.cells.slice(),shown=projection.project(world,0,false);
  expect(shown.settlement.fog!.cells[195*256+190]).toBe(2);
  expect(shown.settlement.fog!.cells).not.toEqual(cells);
  expect(world.view(0).settlement.fog!.cells).toEqual(cells);expect(world.checksum()).toBe(before);
  world.settlement.state.mission!.scene=null;world.tick();
  expect(projection.project(world,0,false)).toEqual(world.view(0));
 });
 it('restores an active cinematic and rejects a damaged pipeline before replacing the running game',()=>{
  const {entry,save,world}=fixture(true),restored=restoreSavedWorld(save,entry.map);
  expect(restored.checksum()).toBe(world.checksum());
  expect(restored.settlement.state.mission?.dialogue?.cinematic).toBe(true);
  expect(()=>restoreSavedWorld({...save,clients:[]},entry.map)).toThrow(/pipeline/);
  expect(()=>restoreSavedWorld({...save,world:{}},entry.map)).toThrow();
  for(let i=0;i<410;i++){world.tick();restored.tick();}
  expect(restored.checksum()).toBe(world.checksum());
 });
});
