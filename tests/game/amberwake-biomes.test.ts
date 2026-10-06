import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {parseUtcMap} from '../../src/shared/map/utcmap';
import {playableMapError} from '../../src/shared/map/playable';
import {projectScene} from '../../src/shared/authoring/project';
import {Game} from '../../src/sim/game/game';
import {slots} from './helpers';

const maps=['amberwake-basin','amberwake-frost'].map(id=>parseUtcMap(JSON.parse(readFileSync(`assets/maps/skirmish/${id}.utcmap`,'utf8')))!);

describe('Amberwake seasonal editions',()=>{
 it('changes the visual biome without changing authored gameplay or generated resource bodies',()=>{
  expect(maps.map(m=>m.biome)).toEqual(['vibrant-forest','frozen-forest']);
  const [forest,frost]=maps;
  expect(frost.playerStarts).toEqual(forest.playerStarts);
  expect(frost.entities).toEqual(forest.entities);
  expect(frost.camps).toEqual(forest.camps);
  const scenes=maps.map(map=>{
   expect(playableMapError(map)).toBeNull();
   const scene=projectScene(map)!;
   expect(scene.generated!.issues).toEqual([]);
   return scene;
  });
  // Tree scale affects physical collision. Ignore only the presentation asset,
  // retaining placement IDs, order, definition, scale, rotation and position.
  const physicalResources=scenes.map(s=>s.resources.map(p=>({...p,appearance:{scale:p.appearance?.scale}})));
  expect(physicalResources[0].length).toBeGreaterThan(3000);
  expect(physicalResources[1]).toEqual(physicalResources[0]);
  expect(scenes[1].resources.every(p=>p.appearance?.asset?.includes('frost-pine'))).toBe(true);
  const layers=new Map(frost.authoring!.layers.map(l=>[l.id,l]));
  for(const layer of forest.authoring!.layers){
   expect(layers.get(layer.id)?.shape,layer.id).toEqual(layer.shape);
   expect(layers.get(layer.id)?.seed,layer.id).toBe(layer.seed);
  }
 });

 it('has identical height, water, static collision and resource occupancy at every navigation cell',()=>{
  const [forest,frost]=maps.map(map=>new Game(map,slots));
  expect(frost.spatial.heights).toEqual(forest.spatial.heights);
  expect(frost.spatial.waterHeights).toEqual(forest.spatial.waterHeights);
  expect(frost.spatial.terrain).toEqual(forest.spatial.terrain);
  const occupancy=(g:Game)=>Uint8Array.from({length:g.map.size**2},(_,cell)=>+g.spatial.walkable(cell));
  expect(occupancy(frost)).toEqual(occupancy(forest));
 });

 it('produces the same harvesting and scouting simulation in both appearances',()=>{
  const games=maps.map(map=>new Game(map,slots,undefined,6401));
  const physicalState=(g:Game)=>{
   const state=structuredClone(g.state);
   // Each edition deliberately uses different render assets; all other
   // simulation state, including collision scale and PRNG state, must agree.
   for(const e of state.entities)if(e.appearance)e.appearance.asset='seasonal-tree';
   return state;
  };
  for(const g of games)for(const owner of ['player.1','player.2'] as const){
   const hero=g.entities.find(e=>e.owner===owner&&g.registry.get(e.definition).hero)!;
   expect(g.command(owner,{type:'move',actors:[hero.id],destination:owner==='player.1'?{x:105,y:404}:{x:406,y:107},attackMove:false}).accepted).toBe(true);
  }
  for(let tick=0;tick<1200;tick++){
   for(const g of games)g.tick();
   if(tick%200===199)expect(physicalState(games[1])).toEqual(physicalState(games[0]));
  }
 },30000);
});
