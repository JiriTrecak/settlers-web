import {expect,it} from 'vitest';
import {ContentRegistry} from '../../src/content/registry';
import type {AuthoredDefinition,Rules} from '../../src/content/schema';
import {chosenHero,startingUnits} from '../../src/content/startingHero';
import {expandMap} from '../../src/content/map';
import {World} from '../../src/sim/world/world';
import {Game} from '../../src/sim/game/game';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import type {Slot} from '../../src/shared/match/match';
import {createSkirmishMatch,setLocalController} from '../../src/shared/match/skirmish';
import {parseMatchConfig,namedMatch} from '../../src/shared/save/save';
import {localSaveSchema} from '../../src/shared/save/localSave';
import {emptyPipeline} from '../../src/shared/save/save';
import {source,slots} from './helpers';
function catalogue(){
 const src=source(),rules=src.rules as Rules;
 const marshal=src.definitions.find(d=>(d as AuthoredDefinition).id==='unit.ants.marshal') as AuthoredDefinition;
 src.definitions.push({...structuredClone(marshal),id:'unit.test.warden',name:'Test Warden'});
 rules.startingSetup.hero!.choices.push('unit.test.warden');rules.startingSetup.gathering=[];
 return {src,rules,registry:new ContentRegistry(src)};
}
const selected=[{...slots[0],hero:'unit.test.warden'},{...slots[1],hero:'unit.ants.marshal'}];
it('declares a default hero separately from fixed workers and rejects invalid choice catalogues',()=>{
 const {src,rules,registry}=catalogue();
 expect(startingUnits(registry.rules.startingSetup)).toHaveLength(7);
 expect(registry.rules.startingSetup.units.every(u=>u.definition==='unit.ants.settler')).toBe(true);
 expect(chosenHero(rules.startingSetup.hero)).toBe('unit.ants.marshal');
 for(const hero of [{...rules.startingSetup.hero!,default:'unit.test.missing'},
  {...rules.startingSetup.hero!,choices:['unit.ants.marshal','unit.ants.marshal']},
  {...rules.startingSetup.hero!,choices:['unit.ants.marshal','unit.ants.settler']}]){
  const bad=structuredClone(src);(bad.rules as Rules).startingSetup.hero=hero;expect(()=>new ContentRegistry(bad)).toThrow();
 }
});
it('spawns the selected hero once per owner without changing workers, funds or supply',()=>{
 const {registry}=catalogue(),map=emptyUtcMap(),g=new Game(map,selected,registry,10);
 const heroes=g.entities.filter(e=>registry.get(e.definition).hero);
 expect(heroes.map(e=>[e.owner,e.definition])).toEqual([['player.1','unit.test.warden'],['player.2','unit.ants.marshal']]);
 for(const owner of ['player.1','player.2'] as const){
  expect(g.entities.filter(e=>e.owner===owner&&registry.get(e.definition).behaviors.work)).toHaveLength(6);
  expect(g.state.wallets[owner]).toEqual({'item.amber':500,'item.wood':150});
  expect(g.view(owner).supply).toMatchObject({used:10,capacity:15});
 }
 expect(expandMap(map,registry).filter(p=>registry.get(p.definition).hero).every(p=>p.definition==='unit.ants.marshal')).toBe(true);
 expect(()=>new Game(map,[{...slots[0],hero:'unit.ants.settler'},slots[1]],registry)).toThrow(/Unavailable starting hero/);
});
it('retains choices when moving the local seat, freezing a match, renaming players and parsing saves',()=>{
 const map=emptyUtcMap(),changed=setLocalController(selected,1,'human'),{rules}=catalogue();
 const {match}=createSkirmishMatch({mapId:'hero-test',slots:changed},map.playerStarts,'test','Player',1,false,rules.startingSetup.hero);
 expect(match.slots.map(s=>s.hero)).toEqual(selected.map(s=>s.hero));
 expect(parseMatchConfig(match)).toEqual(match);
 expect(namedMatch(match,new Map([[0,'Renamed']])).slots[0].hero).toBe('unit.test.warden');
 expect(parseMatchConfig({...match,slots:[{...match.slots[0],hero:42}]})).toBeNull();
 const save={v:4,remote:false,mode:'skirmish',player:1,match,mapId:match.mapId,mapRevision:match.mapRevision,seed:match.seed,world:{},pipeline:emptyPipeline(0,match.slots),clients:match.slots.map(s=>({player:s.player,sentThrough:1,outbox:[]}))};
 expect(localSaveSchema.parse(save).match.slots.map(s=>s.hero)).toEqual(selected.map(s=>s.hero));
});
it('restores a selected roster deterministically and rejects a different frozen choice',()=>{
 const {registry}=catalogue(),map=emptyUtcMap(),options={map,slots:selected,registry,seed:91};
 const a=new World(options),b=new World(options);for(let i=0;i<20;i++)a.tick();b.restore(a.snapshot());
 for(let i=0;i<40;i++){a.tick();b.tick();expect(b.checksum('full')).toBe(a.checksum('full'));}
 expect(b.snapshot()).toEqual(a.snapshot());
 const wrong=new World({...options,slots:[{...selected[0],hero:'unit.ants.marshal'},selected[1]]});
 expect(()=>wrong.restore(a.snapshot())).toThrow();
});
it('does not inject a starting hero into authored sandbox entities',()=>{
 const {registry}=catalogue(),map={...emptyUtcMap(),sandbox:true};
 expect(expandMap(map,registry,selected)).toEqual([]);
});

it('freezes the declared default for local matches and rejects forged local choices',()=>{
 const map=emptyUtcMap(),{rules}=catalogue();
 const make=(chosen:Slot[]=slots)=>createSkirmishMatch({mapId:'test',slots:chosen},map.playerStarts,'test','',1,false,rules.startingSetup.hero);
 expect(make([{player:0,kind:'human'},{player:1,kind:'ai'}]).match.slots.map(s=>s.hero)).toEqual(['unit.ants.marshal','unit.ants.marshal']);
 expect(()=>make([{...slots[0],hero:'unit.ants.settler'},{...slots[1],kind:'ai'}])).toThrow(/Unavailable starting hero/);
});
