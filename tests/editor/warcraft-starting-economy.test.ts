import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {readWarcraftMap} from '../../src/editor/import/warcraft/read';
import {convertWarcraftMap} from '../../src/editor/import/warcraft/convert';
import {content} from '../../src/content/builtin';
import {playableMapError} from '../../src/shared/map/playable';
import {Game} from '../../src/sim/game/game';
import policy from '../../content/import/warcraft/policy.json';

// ENGINE-COUPLED: the Warcraft converter places shipped definitions (policy.json mine, campCompositions, the shipped
// starting setup), so the imported map can only be simulated against the shipped registry. Expectations are derived
// from the same policy and rules rather than named ids. Inputs are test-owned .w3x fixtures.
const races=Object.keys(content.rules.races);
it.each(['echo-isles','turtle-rock'])('imports %s with a reachable, playable starting economy for every race',name=>{
 const {map}=convertWarcraftMap(readWarcraftMap(new Uint8Array(readFileSync(`tests/editor/fixtures/warcraft/${name}.w3x`))));
 expect(playableMapError(map)).toBeNull();
 const site=policy.mineOffsets.map(([,dz])=>policy.startingMineDistance+Math.abs(dz)).sort();
 for(const race of races){
  const slots=map.playerStarts.map((_,player)=>({player,kind:'human' as const,race}));
  const g=new Game(map,slots,content);
  for(const start of map.playerStarts){
   const owner=`player.${start.player}` as const,hall=g.context.get(g.state.objectives[owner])!;
   const nodes=map.entities.filter(e=>e.definition===policy.mineDefinition&&Math.hypot(e.position.x-start.x,e.position.y-start.z)<policy.startingMineSearchRadius);
   expect(nodes).toHaveLength(policy.mineOffsets.length);
   expect(nodes.reduce((n,e)=>n+e.position.x,0)/nodes.length).toBe(start.x);
   expect(nodes.map(e=>Math.abs(e.position.y-start.z)).sort()).toEqual(site);
   const workers=g.entities.filter(e=>e.owner===owner&&content.get(e.definition).behaviors.work);
   expect(workers.length).toBeGreaterThan(0);expect(workers.every(w=>g.spatial.unitWalkable(w,w))).toBe(true);
   expect(g.view(owner).entities.find(e=>e.id===hall.id)?.baseGathering?.workers).toBe(workers.length);
   for(const node of nodes){
    const target=g.entities.find(e=>e.placement===node.id)!,worker=workers[0];
    const approaches=[1,2,3].flatMap(r=>g.spatial.perimeter(target,r));
    expect(approaches.some(p=>g.spatial.unitWalkable(p,worker)&&g.spatial.attackClear(p,target,false)&&g.spatial.findPath(g.spatial.cell(worker),g.spatial.cell(p),undefined,Infinity,worker)!==null),node.id).toBe(true);
   }
  }
 }
},120000);
