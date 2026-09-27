import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {content} from '../../src/content/builtin';
import {parseUtcMap} from '../../src/shared/map/utcmap';
import {playableMapError} from '../../src/shared/map/playable';
import {Game} from '../../src/sim/game/game';
import {slots} from './helpers';
import {THREEWATER_ROOT_SITES} from '../../scripts/maps/threewater-resources';
it('Threewater has two finite Root deposits reachable from both bases, with room for Rootworks',()=>{
 const map=parseUtcMap(JSON.parse(readFileSync('assets/maps/skirmish/threewater-forest.utcmap','utf8')))!;expect(playableMapError(map)).toBeNull();
 const g=new Game(map,slots,content);const deposits=g.entities.filter(e=>e.definition==='building.neutral.corrupted-root');expect(deposits).toHaveLength(2);
 const worker=g.entities.find(e=>e.owner==='player.1'&&content.get(e.definition).behaviors.work)!;
 for(const site of THREEWATER_ROOT_SITES){
  const deposit=deposits.find(e=>e.x===site.x&&e.y===site.y)!;
  expect(deposit.resource!.amount).toBe(3000);expect(content.get(deposit.definition).gatheringCapacity).toBe(5);
  for(const start of map.playerStarts){
   expect(Math.hypot(start.x-site.x,start.z-site.y)).toBeGreaterThanOrEqual(36);
   const hall=g.entities.find(e=>e.placement===start.mainFort)!;
   expect(g.spatial.findPath(g.spatial.cell(g.spatial.entrance(hall)),g.spatial.cell(g.spatial.entrance(deposit)))).not.toBeNull();
  }
  // Scout the surrounding build area, then leave the footprint clear.
  for(let dz=-16;dz<=16;dz+=8)for(let dx=-16;dx<=16;dx+=8){worker.x=site.x+dx;worker.y=site.y+dz;worker.unit!.position=null;g.observation.update();}
  worker.x=site.x;worker.y=site.y+4;g.observation.update();
  let buildable=0;
  for(let y=site.y-18;y<=site.y+18;y+=2)for(let x=site.x-18;x<=site.x+18;x+=2)
   if(g.canBuild('player.1','building.ants.rootworks',{x,y},worker.id)===null)buildable++;
  expect(buildable).toBeGreaterThan(0);
 }
},30000);
