/** Regression coverage migrated from the retired Mosswater layout to the current library. */
import {readFileSync,readdirSync} from 'node:fs';
import {expect,it} from 'vitest';
import {parseUtcMap,stringifyUtcMap} from '../../src/shared/map/utcmap';
import {playableMapError} from '../../src/shared/map/playable';
import {Game} from '../../src/sim/game/game';
import {content} from '../../src/content/builtin';
import {slots} from '../game/helpers';
import {createMapBriefing} from '../../src/sim/ai/briefing';
const map=parseUtcMap(JSON.parse(readFileSync('assets/maps/skirmish/worldroot-hollow.utcmap','utf8')))!;
it('ships only Worldroot and round trips its starts and landscape',()=>{
 expect(readdirSync('assets/maps',{recursive:true}).filter(f=>String(f).endsWith('.utcmap'))).toEqual(['skirmish/worldroot-hollow.utcmap']);
 expect(playableMapError(map)).toBeNull();
 const restored=parseUtcMap(JSON.parse(stringifyUtcMap(map)))!;
 expect(restored.playerStarts).toEqual(map.playerStarts);expect(restored.landscape).toEqual(map.landscape);
 expect(restored.waterLevel ?? 0).toBe(map.waterLevel ?? 0);
});
it('has traversable shallows and blocked deep water with identical AI terrain knowledge',()=>{
 const g=new Game(map,slots,content),briefing=createMapBriefing(map,content);
 let shallow=0,deep=0;
 for(let i=0;i<g.spatial.heights.length;i++){
  const h=g.spatial.heights[i];
  expect(briefing.land[i]).toBe(g.spatial.terrain[i]);
  if(h<0&&h>=-60){shallow++;expect(g.spatial.terrain[i]).toBe(1);}
  if(h< -60){deep++;expect(g.spatial.terrain[i]).toBe(0);}
 }
 expect(shallow).toBeGreaterThan(500);expect(deep).toBeGreaterThan(1000);
});
it('keeps home construction ground dry, with a complete scenery palette and clustered timber',()=>{
 const g=new Game(map,slots,content);
 for(const s of map.playerStarts)for(let dy=-7;dy<=7;dy++)for(let dx=-7;dx<=7;dx++)expect(g.spatial.heights[(s.z+dy)*map.size+s.x+dx]).toBeGreaterThan(10);
 const trees=map.entities.filter(e=>e.definition==='resource.forest.tree');
 expect(trees.length).toBeGreaterThan(2000);
 for(const id of ['ant-rock','ant-reeds','ant-lily','ant-fern','synty-plant-flowerpatch-01','ant-driftwood'])expect(map.stamps.some(s=>s.asset===id)).toBe(true);
});
it('does not permit construction on otherwise walkable shallow ground',()=>{
 const g=new Game(map,slots,content);
 const worker=g.entities.find(e=>e.owner==='player.1'&&content.get(e.definition).behaviors.work)!;
 const p={x:42,y:146};worker.x=42;worker.y=151;worker.unit!.position=null;g.observation.update();
 const cells=g.spatial.footprint({definition:'building.ants.house',...p,rotation:0});
 for(const i of cells){g.spatial.heights[i]=-32;g.spatial.terrain[i]=1;g.spatial.occupied[i]=0;g.spatial.resources[i]=0;}
 expect(g.canBuild('player.1','building.ants.house',p,worker.id)).toBe('Build on dry ground');
});
