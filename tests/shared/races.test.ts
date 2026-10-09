import {expect,it} from 'vitest';
import {content,builtinSource} from '../../src/content/builtin';
import {ContentRegistry} from '../../src/content/registry';
import {rulesSchema} from '../../src/content/schema';
import {raceDefinition} from '../../src/content/races';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {createSkirmishMatch,defaultSlots} from '../../src/shared/match/skirmish';
import {createMissionMatch} from '../../src/shared/scenario/match';
import {parseMatchConfig} from '../../src/shared/save/save';
import {World} from '../../src/sim/world/world';
import {snapPlacement} from '../../src/shared/spatial/placement';
const map=emptyUtcMap();
function setup(){return createSkirmishMatch({mapId:'mixed',slots:defaultSlots(map.playerStarts,null).map((s,i)=>({...s,race:i?'beetles':'ants'}))},map.playerStarts,'r');}
it('freezes race and matching hero and spawns each declared starting army',()=>{
 const {match}=setup(),w=new World({map,slots:match.slots,seed:1});
 expect(match.slots.map(s=>[s.race,s.hero])).toEqual([['ants','unit.ants.marshal'],['beetles','unit.beetles.hornbreaker']]);
 for(const [i,race] of ['ants','beetles'].entries()){
  const d=raceDefinition(content.rules,race),owner=`player.${i+1}`,own=w.settlement.entities.filter(e=>e.owner===owner);
  expect(own.filter(e=>e.definition===d.startingSetup.units[0].definition)).toHaveLength(6);expect(own.some(e=>e.definition===d.startingSetup.fort)).toBe(true);expect(own.some(e=>e.definition===d.startingSetup.hero!.default)).toBe(true);
 }
 expect(parseMatchConfig(match)).toEqual(match);
 expect(()=>createSkirmishMatch({mapId:'bad',slots:[{player:0,kind:'human',race:'beetles',hero:'unit.ants.marshal'},{player:1,kind:'ai'}]},map.playerStarts,'r')).toThrow();
 expect(()=>new World({map,slots:[{player:0,kind:'human',race:'unknown'},{player:1,kind:'ai'}],seed:1})).toThrow('Unknown race');
});
it('matches worker economics, starting wallet and hall geometry exactly',()=>{
 const a=content.get('unit.ants.settler'),b=content.get('unit.beetles.worker');
 expect(b.creation).toEqual(a.creation);expect(b.supplyCost).toEqual(a.supplyCost);expect(b.dimensions).toEqual(a.dimensions);expect(b.behaviors.movement).toEqual(a.behaviors.movement);
 const {builds:ab,...aw}=a.behaviors.work!,{builds:bb,...bw}=b.behaviors.work!;expect(bw).toEqual(aw);expect(bb.every(id=>id.startsWith('building.beetles.'))).toBe(true);expect(ab.every(id=>id.startsWith('building.ants.'))).toBe(true);
 for(const key of ['inventory','gathering'] as const)expect(raceDefinition(content.rules,"beetles").startingSetup[key]).toEqual(raceDefinition(content.rules,"ants").startingSetup[key]);
 const ah=content.get('building.ants.fort'),bh=content.get('building.beetles.bastion');for(const key of ['footprint','entrance','creation','supplyProvided','heroCapacity'] as const)expect(bh[key]).toEqual(ah[key]);expect(bh.behaviors.storage).toEqual(ah.behaviors.storage);
});
it('delivers identical amber on identical routes and gathering orders',()=>{
 const battlefield={...map,entities:[{id:'mine',definition:'building.neutral.amber-mine',owner:'none' as const,position:snapPlacement(content.get('building.neutral.amber-mine'),{x:220,y:205}),rotation:0}]};
 const worlds=['ants','beetles'].map(race=>new World({map:battlefield,slots:[{player:0,kind:'human',race},{player:1,kind:'human',race:'ants'}],seed:1}));
 for(let tick=0;tick<1600;tick++){
  for(const world of worlds)world.tick();
  if(tick%40===0)expect(worlds[0].settlement.state.wallets['player.1']).toEqual(worlds[1].settlement.state.wallets['player.1']);
 }
 expect(worlds[0].settlement.state.wallets['player.1']['item.amber']).toBeGreaterThan(500);
});
it('rejects foreign production/research and invalid campaign declarations',()=>{
 const source={...structuredClone(builtinSource),rules:rulesSchema.parse(builtinSource.rules)};(source.definitions.find(d=>(d as {id:string}).id==='building.beetles.war-lodge') as {behaviors:{production:{outputs:string[]}}}).behaviors.production.outputs.push('unit.ants.archer');expect(()=>new ContentRegistry(source)).toThrow(/roster/);
 const bad={...structuredClone(builtinSource),rules:rulesSchema.parse(builtinSource.rules)};bad.rules.campaigns.vanguard.race='unknown';expect(()=>new ContentRegistry(bad)).toThrow('Unknown campaign race');
});
it('propagates campaign defaults and mission participant overrides without replacing authored armies',()=>{
 const mission={...map,mission:{campaign:'vanguard',title:'Test',order:1,script:'function on_start() end',regions:[],playerRaces:{'player.2':'beetles'}}};
 expect(createMissionMatch('m',mission,'r').slots.map(s=>s.race)).toEqual(['ants','beetles']);
 expect(createMissionMatch('m',{...mission,mission:{...mission.mission,race:'beetles'}},'r').slots.map(s=>s.race)).toEqual(['beetles','beetles']);
 expect(()=>createMissionMatch('m',{...mission,mission:{...mission.mission,race:'bad'}},'r')).toThrow();
});
it('mixed-race AI resumes deterministically and issues only its own production/build orders',()=>{
 const {match}=setup(),a=new World({map,slots:match.slots,seed:41}),b=new World({map,slots:match.slots,seed:41});
 for(let i=0;i<240;i++)a.tick();b.restore(JSON.parse(JSON.stringify(a.snapshot())));
 for(let i=0;i<240;i++){a.tick();b.tick();expect(a.checksum()).toBe(b.checksum());}
 const log=a.log();expect(log.some(e=>e.player===1)).toBe(true);
 expect(log.find(e=>e.player===1&&e.action.type==='learnAbility')?.action).toMatchObject({ability:'overwhelm'});
 for(const entry of log){const action=entry.action;if(action.type==='build'||action.type==='produce')expect(action.definition).toContain(entry.player===1?'.beetles.':'.ants.');}
});
it('beetle AI completes its own buildings and trains both combat units',()=>{
 const {match}=setup(),world=new World({map,slots:match.slots,seed:41});
 for(const owner of ['player.1','player.2'])world.settlement.state.wallets[owner]={'item.amber':5000,'item.wood':3000,'item.root':500};
 for(let i=0;i<14000;i++){
  world.tick();
  const own=world.settlement.entities.filter(e=>e.owner==='player.2');
  if(own.some(e=>e.definition==='unit.beetles.horn-guard')&&own.some(e=>e.definition==='unit.beetles.stone-slinger'))break;
 }
 const beetles=world.settlement.entities.filter(e=>e.owner==='player.2');
 expect(beetles.some(e=>e.definition==='building.beetles.war-lodge'&&!e.construction)).toBe(true);
 expect(beetles.some(e=>e.definition==='unit.beetles.horn-guard')).toBe(true);
 expect(beetles.some(e=>e.definition==='unit.beetles.stone-slinger')).toBe(true);
 for(const entry of world.log()){const a=entry.action;if(entry.player===1&&(a.type==='build'||a.type==='produce'))expect(a.definition).toContain('.beetles.');}
},120000);
