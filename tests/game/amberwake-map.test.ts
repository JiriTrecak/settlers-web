import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {parseUtcMap} from '../../src/shared/map/utcmap';
import {playableMapError} from '../../src/shared/map/playable';
import {content,builtinSource} from '../../src/content/builtin';
import {ContentRegistry} from '../../src/content/registry';
import type {Rules} from '../../src/content/schema';
import {Game} from '../../src/sim/game/game';
import {run,slots} from './helpers';
import {precise} from '../../src/sim/game/motion';
import {footprintCellBounds} from '../../src/shared/spatial/footprint';

// Live-editor exports. These checks establish foundations, not finished map balance.
describe.each(['amberwake-basin','amberwake-wilds'])('%s competitive map contract',id=>{
const map=parseUtcMap(JSON.parse(readFileSync(`assets/maps/skirmish/${id}.utcmap`,'utf8')))!;
it('provides two legal opposing starts, eight four-node sites and live landscape layers',()=>{
 expect(playableMapError(map)).toBeNull();expect(map.size).toBe(512);
 expect(map.playerStarts).toHaveLength(2);
 const [a,b]=map.playerStarts;expect(b).toMatchObject({x:511-a.x,z:511-a.z,rotation:180});
 expect(map.entities.filter(e=>e.definition==='building.neutral.amber-mine')).toHaveLength(32);
 expect(map.entities.filter(e=>e.definition==='building.neutral.corrupted-root')).toHaveLength(2);
 expect(map.camps).toHaveLength(6);
 expect(map.authoring!.layers.some(l=>['recipe.grass.meadow','recipe.meadow.woodland-edge'].includes(l.recipe))).toBe(true);
 const g=new Game(map,slots,content,6401);
 for(const e of g.entities.filter(e=>e.owner!=='none'&&e.unit))expect(g.spatial.unitWalkable(e,e)).toBe(true);
 run(g,400);
 expect(g.state.jobs.filter(j=>j.item==='item.wood')).toHaveLength(4);
 run(g,800);
 for(const owner of ['player.1','player.2'])expect(g.state.wallets[owner]['item.wood']).toBeGreaterThan(150);
});

it('keeps opposing approach routes within the 135-C pacing target for the real infantry body',()=>{
 const g=new Game(map,slots,content,6401),s=g.spatial,lengths=[];
 for(const owner of ['player.1','player.2'] as const){
  const body=g.entities.find(e=>e.owner===owner&&e.definition==='unit.ants.settler')!;
  let prev={x:owner==='player.1'?105:406,y:owner==='player.1'?404:107};
  const destination={x:511-prev.x,y:511-prev.y},route=s.findPath(s.cell(prev),s.cell(destination),undefined,Infinity,body);
  expect(route).not.toBeNull();let distance=0;
  for(const cell of route!){const p=s.point(cell);distance+=Math.hypot(p.x-prev.x,p.y-prev.y);prev=p;}
  lengths.push(distance);
 }
 expect(Math.abs(lengths[0]-lengths[1])/Math.max(...lengths)).toBeLessThan(.03);
 for(const length of lengths)expect(length/4).toBeCloseTo(135,-1);
 for(const length of lengths)expect(Math.abs(length/12-45)).toBeLessThan(1.35);
});

it.each([4,8,12])('measures %i miners at both authored home sites, with no production or AI subsidy',count=>{
 const source=structuredClone(builtinSource),rules=source.rules as Rules;
 rules.startingSetup.gathering=[];
 const original=rules.startingSetup.units;
 rules.startingSetup.units=Array.from({length:count},(_,i)=>original[i]??{definition:'unit.ants.settler',offset:{x:-10+(i-6)*4,y:30}});
 const registry=new ContentRegistry(source),g=new Game(map,slots,registry,6401);
 for(const owner of ['player.1','player.2'] as const){
  const workers=g.entities.filter(e=>e.owner===owner&&registry.get(e.definition).behaviors.work);
  const node=g.entities.find(e=>e.placement===`amber.${owner==='player.1'?1:2}.home.2`)!;
  for(const worker of workers)expect(g.spatial.unitWalkable(worker,worker)).toBe(true);
  expect(g.command(owner,{type:'gather',actors:workers.map(w=>w.id),target:node.id}).actors).toHaveLength(count);
 }
 run(g,400);const start=structuredClone(g.state.wallets);run(g,2400);
 const income=['player.1','player.2'].map(owner=>g.state.wallets[owner]['item.amber']-start[owner]['item.amber']);
 if(count===4){for(const amount of income){expect(amount).toBeGreaterThanOrEqual(600);expect(amount).toBeLessThan(680);}}
 else expect(income).toEqual([1200,1200]);
 expect(Math.abs(income[0]-income[1])/Math.max(...income)).toBeLessThan(.03);
 if(count===8){
  const restored=new Game(map,slots,registry,6401);restored.restore(g.snapshot());
  for(let i=0;i<400;i++){g.tick();restored.tick();if(i%40===0)expect(restored.checksum('full')).toBe(g.checksum('full'));}
  expect(restored.snapshot()).toEqual(g.snapshot());
 }
},30000);


it('walks both approaches in about 45 seconds without pulling camps, including a cold save mid-route',()=>{
 const source=structuredClone(builtinSource);(source.rules as Rules).startingSetup.gathering=[];
 const registry=new ContentRegistry(source),scenario={...structuredClone(map),entities:[...map.entities]};
 for(const side of [1,2] as const)scenario.entities.push({id:`scout.${side}`,definition:'unit.ants.warrior',owner:`player.${side}`,position:{x:side===1?105:406,y:side===1?404:107},rotation:side===1?0:180});
 const g=new Game(scenario,slots,registry,6401),scouts=g.entities.filter(e=>e.placement?.startsWith('scout.'));
 for(const e of scouts)expect(g.command(e.owner,{type:'move',actors:[e.id],destination:{x:511-e.x,y:511-e.y},attackMove:false}).accepted).toBe(true);
 const arrivals=new Map<number,number>();let restored:Game|undefined;
 for(let tick=1;tick<=2000;tick++){
  g.tick();restored?.tick();
  if(tick===800){restored=new Game(scenario,slots,registry,6401);restored.restore(JSON.parse(JSON.stringify(g.snapshot())));}
  for(const e of scouts)if(!arrivals.has(e.id)&&!e.unit!.goal){
   arrivals.set(e.id,tick);
   expect(precise(e)).toEqual(e.owner==='player.1'?{x:406,y:107}:{x:105,y:404});
   expect(e.hp).toBe(content.get(e.definition).body!.maxHp);
   const action={type:'hold' as const,actors:[e.id]};g.command(e.owner,action);restored?.command(e.owner,action);
  }
  if(restored&&tick%40===0)expect(restored.checksum('full')).toBe(g.checksum('full'));
  if(arrivals.size===2)break;
 }
 expect(arrivals.size).toBe(2);const times=[...arrivals.values()].map(t=>t/40);
 for(const time of times)expect(Math.abs(time-45)).toBeLessThan(1.35);
 expect(Math.abs(times[0]-times[1])).toBeLessThan(1.35);
 expect(restored!.snapshot()).toEqual(g.snapshot());
},30000);

it('fits mirrored production bases with clear building exits and large-unit access',()=>{
 const scenario={...structuredClone(map),entities:[...map.entities]};
 const layout=[['barracks',73.5,361.5],['barracks',97.5,361.5],['bombardier-workshop',121.5,361.5],['ironroot-forge',145.5,361.5],['sanctuary',121.5,385.5],['house',71.5,391.5],['house',91.5,391.5],['house',111.5,411.5],['house',131.5,411.5],['house',151.5,411.5],['tower',151.5,391.5]] as const;
 // Shelf bounds are 24 × 22 C, apart from the southern/northern mining lanes.
 for(const side of [1,2] as const)for(const [index,[type,x,y]] of layout.entries()){
  const position={x:side===1?x:511-x,y:side===1?y:511-y},definition=`building.ants.${type}`,rotation=side===1?0:180;
  const b=footprintCellBounds({x,y},content.get(definition).footprint,0);
  expect(b.minX).toBeGreaterThanOrEqual(60);expect(b.maxX).toBeLessThanOrEqual(155);
  expect(b.minY).toBeGreaterThanOrEqual(348);expect(b.maxY).toBeLessThanOrEqual(435);
  scenario.entities.push({id:`capacity.${side}.${index}`,definition,owner:`player.${side}`,position,rotation});
 }
 expect(playableMapError(scenario)).toBeNull();
 const g=new Game(scenario,slots,content,6401),s=g.spatial;
 const body={definition:'unit.ants.bombardier'};
 for(const b of g.entities.filter(e=>e.placement?.startsWith('capacity.'))){
  const entrance=s.entrance(b);expect(s.walkable(s.cell(entrance))).toBe(true);
  const goal={x:b.owner==='player.1'?105:406,y:b.owner==='player.1'?404:107};
  const exit=s.deployment(b,goal,body);expect(exit).not.toBeNull();
  expect(s.findPath(s.cell(exit!),s.cell(goal),undefined,Infinity,body)).not.toBeNull();
  const cells=s.footprint(b),heights=cells.map(c=>s.heights[c]);
  expect(Math.max(...heights)-Math.min(...heights)).toBeLessThanOrEqual(1);
  expect(cells.every(c=>s.heights[c]>s.waterHeights[c]+10)).toBe(true);
 }
});

});
