import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {content} from '../../src/content/builtin';
import {parseUtcMap} from '../../src/shared/map/utcmap';
import {playableMapError} from '../../src/shared/map/playable';
import {Game} from '../../src/sim/game/game';
import {slots} from './helpers';
const sites=JSON.parse(readFileSync('scripts/maps/tier-two-root-sites.json','utf8')) as {file:string,camp:string,deposit:{x:number,y:number},rootworks:{x:number,y:number}}[];
it.each([...new Set(sites.map(s=>s.file))])('%s has guarded finite Root accessible to both players with buildable Rootworks space',file=>{
 const map=parseUtcMap(JSON.parse(readFileSync(file,'utf8')))!;expect(playableMapError(map)).toBeNull();
 const g=new Game(map,slots,content);const deposits=g.entities.filter(e=>e.definition==='building.neutral.corrupted-root');expect(deposits).toHaveLength(2);
 for(const site of sites.filter(s=>s.file===file)){
  const deposit=deposits.find(e=>e.x===site.deposit.x&&e.y===site.deposit.y)!;
  expect(deposit.resource!.amount).toBe(3000);expect(content.get(deposit.definition).gatheringCapacity).toBe(5);
  const camp=map.camps.find(c=>c.id===site.camp)!;expect(camp.aggression).toBe('players');
  expect(camp.members.length).toBeGreaterThan(0);expect(Math.hypot(camp.home.x-deposit.x,camp.home.y-deposit.y)).toBeLessThanOrEqual(camp.aggroRange);
  for(const start of map.playerStarts){
   expect(Math.hypot(start.x-deposit.x,start.z-deposit.y)).toBeGreaterThanOrEqual(40);
   const from=g.spatial.cell({x:start.x,y:start.z+8}),entrance=g.spatial.entrance(deposit);
   expect(g.spatial.navigation.path(from,g.spatial.cell(entrance))).not.toBeNull();
   expect(g.spatial.navigation.path(from,g.spatial.cell({x:site.rootworks.x,y:site.rootworks.y+4}))).not.toBeNull();
  }
  const worker=g.entities.find(e=>e.owner==='player.1'&&content.get(e.definition).behaviors.work)!;
  worker.x=site.rootworks.x;worker.y=site.rootworks.y+4;worker.unit!.position=null;
  // Reveal both the deposit and the complete construction footprint, like a scouted site.
  const scout=g.entities.find(e=>e.owner==='player.1'&&e.definition==='unit.ants.marshal')!;scout.x=site.deposit.x;scout.y=site.deposit.y+4;scout.unit!.position=null;
  g.observation.update();
  expect(g.canBuild('player.1','building.ants.rootworks',site.rootworks,worker.id)).toBeNull();
 }
});
