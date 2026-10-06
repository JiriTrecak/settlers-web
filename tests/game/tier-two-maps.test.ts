import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {content,builtinSource} from '../../src/content/builtin';
import {ContentRegistry} from '../../src/content/registry';
import type {Rules} from '../../src/content/schema';
import {parseUtcMap} from '../../src/shared/map/utcmap';
import {playableMapError} from '../../src/shared/map/playable';
import {Game} from '../../src/sim/game/game';
import {slots,run} from './helpers';

it.each(['amberwake-basin','amberwake-frost','amberwake-wilds'])('%s has reachable finite Root deposits and legal working Rootworks',id=>{
 const map=parseUtcMap(JSON.parse(readFileSync(`assets/maps/skirmish/${id}.utcmap`,'utf8')))!;
 expect(playableMapError(map)).toBeNull();
 const g=new Game(map,slots,content),s=g.spatial;
 const deposits=g.entities.filter(e=>e.definition==='building.neutral.corrupted-root');
 expect(deposits).toHaveLength(2);
 const worker=g.entities.find(e=>e.owner==='player.1'&&content.get(e.definition).behaviors.work)!;
 for(const deposit of deposits){
  expect(deposit.resource!.amount).toBe(1500);
  expect(content.get(deposit.definition).harvesting?.recommendedWorkers).toBe(2);
  // Declared doors lie one nav cell outside a footprint; a full worker body
  // needs a wider work ring, exactly as harvesting does in the simulation.
  const workPoints=[2,3,4].flatMap(r=>s.perimeter(deposit,r)).filter(p=>s.unitWalkable(p,worker)&&s.attackClear(p,deposit,false));
  expect(workPoints.length).toBeGreaterThan(0);
  for(const start of map.playerStarts){
   const hall=g.entities.find(e=>e.placement===start.mainFort)!;
   const from=s.deployment(hall,deposit,worker)!;
   expect(from).not.toBeNull();
   expect(workPoints.some(to=>s.findPath(s.cell(from),s.cell(to),undefined,Infinity,worker)!==null)).toBe(true);
  }
 }
 const sites=[{x:153.5,y:309.5},{x:357.5,y:201.5}];
 for(const [i,deposit] of deposits.entries()){
  // A scouting worker reveals the site, then stands clear of the foundation.
  for(let dy=-20;dy<=20;dy+=4)for(let dx=-20;dx<=20;dx+=4){worker.x=deposit.x+dx;worker.y=deposit.y+dy;worker.unit!.position=null;g.observation.update();}
  worker.x=deposit.x+14;worker.y=deposit.y-14;g.observation.update();
  expect(g.canBuild('player.1','building.ants.rootworks',sites[i],worker.id)).toBeNull();
 }
 // After clearing the guards, both sites must actually accept workers and
 // deliver Root, not merely offer a nominally legal foundation.
 const scenario={...structuredClone(map),camps:[],entities:map.entities.filter(e=>content.get(e.definition).kind!=='unit')};
 for(const [i,position] of sites.entries())scenario.entities.push({id:`rootworks.${i}`,definition:'building.ants.rootworks',owner:i===0?'player.1':'player.2',position,rotation:i===0?0:180});
 const source=structuredClone(builtinSource);(source.rules as Rules).startingSetup.gathering=[];
 const harvest=new Game(scenario,slots,new ContentRegistry(source),6401);
 for(const [i,owner] of ['player.1','player.2'].entries()){
  const store=harvest.entities.find(e=>e.placement===`rootworks.${i}`)!;
  const w=harvest.entities.find(e=>e.owner===owner&&content.get(e.definition).behaviors.work)!;
  const target=harvest.entities.find(e=>e.definition==='building.neutral.corrupted-root'&&e.x===deposits[i].x)!;
  const stand=harvest.spatial.deployment(store,target,w)!;
  expect(stand).not.toBeNull();w.x=stand.x;w.y=stand.y;w.unit!.position=null;harvest.observation.update();
  expect(harvest.command(w.owner,{type:'gather',actors:[w.id],target:target.id}).actors).toEqual([w.id]);
 }
 run(harvest,1200);
 for(const owner of ['player.1','player.2'])expect(harvest.state.wallets[owner]['item.root']).toBeGreaterThanOrEqual(20);
},30000);
