import {expect,it} from 'vitest';
import {testContent,testSource} from '../fixtures/content';
import {ContentRegistry} from '../../src/content/registry';
import {rulesSchema} from '../../src/content/schema';
import {raceDefinition} from '../../src/content/races';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {createSkirmishMatch,defaultSlots} from '../../src/shared/match/skirmish';
import {createMissionMatch} from '../../src/shared/scenario/match';
import {parseMatchConfig} from '../../src/shared/save/save';
import {World} from '../../src/sim/world/world';
import gameSource from '../../content/game.json';
const map=emptyUtcMap();
const rules=testContent.rules,[alpha,beta]=Object.keys(rules.races) as [string,string];
const mixed=()=>[{player:0,kind:'ai' as const,race:alpha},{player:1,kind:'ai' as const,race:beta}];
const roster=(race:string)=>new Set(raceDefinition(rules,race).roster);

it('freezes lobby race and matching hero into the match config',()=>{
 // ENGINE-COUPLED: the skirmish lobby validates races and heroes against shipped content/game.json (no injection
 // point), so the expected races/heroes are read from that source rather than named.
 const shipped=rulesSchema.parse(gameSource.rules),[first,second]=Object.keys(shipped.races) as [string,string];
 const {match}=createSkirmishMatch({mapId:'mixed',slots:defaultSlots(map.playerStarts,null).map((s,i)=>({...s,race:i?second:first}))},map.playerStarts,'r');
 expect(match.slots.map(s=>[s.race,s.hero])).toEqual([first,second].map(race=>[race,raceDefinition(shipped,race).startingSetup.hero!.default]));
 expect(parseMatchConfig(match)).toEqual(match);
 const foreignHero=raceDefinition(shipped,first).startingSetup.hero!.default;
 expect(()=>createSkirmishMatch({mapId:'bad',slots:[{player:0,kind:'human',race:second,hero:foreignHero},{player:1,kind:'ai'}]},map.playerStarts,'r')).toThrow();
});

it('spawns each race\'s declared fort, starting units and default hero, and rejects unknown races',()=>{
 const w=new World({map,slots:mixed(),seed:1,registry:testContent});
 for(const [i,race] of [alpha,beta].entries()){
  const setup=raceDefinition(rules,race).startingSetup,own=w.settlement.entities.filter(e=>e.owner===`player.${i+1}`);
  for(const definition of new Set(setup.units.map(u=>u.definition)))
   expect(own.filter(e=>e.definition===definition)).toHaveLength(setup.units.filter(u=>u.definition===definition).length);
  expect(own.some(e=>e.definition===setup.fort)).toBe(true);expect(own.some(e=>e.definition===setup.hero!.default)).toBe(true);
 }
 expect(()=>new World({map,slots:[{player:0,kind:'human',race:'unknown'},{player:1,kind:'ai'}],seed:1,registry:testContent})).toThrow('Unknown race');
});

it('rejects foreign production and invalid campaign races',()=>{
 const army=new Set(raceDefinition(rules,beta).ai.composition.map(c=>c.definition));
 const source=testSource(),producer=raceDefinition(rules,beta).roster.find(id=>testContent.get(id).behaviors.production?.outputs.some(o=>army.has(o)))!;
 const foreign=raceDefinition(rules,alpha).roster.find(id=>testContent.get(id).kind==='unit'&&!roster(beta).has(id))!;
 (source.definitions.find(d=>(d as {id:string}).id===producer) as {behaviors:{production:{outputs:string[]}}}).behaviors.production.outputs.push(foreign);
 expect(()=>new ContentRegistry(source)).toThrow(/roster/);
 const raw=testSource(),bad={...raw,rules:rulesSchema.parse(raw.rules)},campaign=Object.keys(bad.rules.campaigns)[0]!;bad.rules.campaigns[campaign]!.race='unknown';
 expect(()=>new ContentRegistry(bad)).toThrow('Unknown campaign race');
});

it('propagates campaign defaults and mission participant overrides without replacing authored armies',()=>{
 const campaign=Object.keys(rules.campaigns)[0]!,campaignRace=rules.campaigns[campaign]!.race,other=campaignRace===alpha?beta:alpha;
 const mission={...map,mission:{campaign,title:'Test',order:1,script:'function on_start() end',regions:[],playerRaces:{'player.2':other}}};
 expect(createMissionMatch('m',mission,'r',rules).slots.map(s=>s.race)).toEqual([campaignRace,other]);
 expect(createMissionMatch('m',{...mission,mission:{...mission.mission,race:other}},'r',rules).slots.map(s=>s.race)).toEqual([other,other]);
 expect(()=>createMissionMatch('m',{...mission,mission:{...mission.mission,race:'bad'}},'r',rules)).toThrow();
});

it('mixed-race AI resumes deterministically and issues only its own race\'s production/build orders',()=>{
 const a=new World({map,slots:mixed(),seed:41,registry:testContent}),b=new World({map,slots:mixed(),seed:41,registry:testContent});
 for(let i=0;i<240;i++)a.tick();b.restore(JSON.parse(JSON.stringify(a.snapshot())));
 for(let i=0;i<240;i++){a.tick();b.tick();expect(a.checksum()).toBe(b.checksum());}
 const log=a.log();expect(log.some(e=>e.player===1)).toBe(true);
 for(const entry of log){const action=entry.action;if(action.type==='build'||action.type==='produce')expect(roster(entry.player===1?beta:alpha).has(action.definition),action.definition).toBe(true);}
});

it('non-default race AI completes its own production building and trains every unit in its composition',()=>{
 const world=new World({map,slots:mixed(),seed:41,registry:testContent}),army=raceDefinition(rules,beta).ai.composition.map(c=>c.definition);
 for(const owner of ['player.1','player.2'])world.settlement.state.wallets[owner]={'item.test.amber':5000,'item.test.wood':3000,'item.test.root':500};
 const own=()=>world.settlement.entities.filter(e=>e.owner==='player.2');
 // With a stocked wallet the test world's beta AI fields its whole composition in about 7,000 ticks.
 for(let i=0;i<9000&&!army.every(d=>own().some(e=>e.definition===d));i++)world.tick();
 for(const definition of army)expect(own().some(e=>e.definition===definition),definition).toBe(true);
 expect(own().some(e=>!e.construction&&testContent.get(e.definition).behaviors.production?.outputs.some(o=>army.includes(o)))).toBe(true);
 for(const entry of world.log()){const a=entry.action;if(entry.player===1&&(a.type==='build'||a.type==='produce'))expect(roster(beta).has(a.definition)).toBe(true);}
},60000);
