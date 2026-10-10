import {expect,it,vi} from 'vitest';
import {emptyUtcMap,parseUtcMap,stringifyUtcMap} from '../../src/shared/map/utcmap';
import {editTerrainGrid} from '../../src/shared/authoring/gridTerrain';
import {Game} from '../../src/sim/game/game';
import {placed,slots} from './helpers';

it('uses saved shallow, deep, dry and ramp terrain consistently for movement and construction',()=>{
 const map={...emptyUtcMap(),entities:[placed('builder','unit.ants.settler',128,128)]};
 const selection={type:'rectangle' as const,from:{x:33,z:30},to:{x:36,z:34}};
 const position={x:135.5,y:127.5},cell=128*map.size+136;
 const game=()=>{
  const loaded=parseUtcMap(JSON.parse(stringifyUtcMap(map)))!;
  const g=new Game(loaded,slots),actor=g.entities.find(e=>e.placement==='builder')!;
  // Isolate terrain placement rules from fog: the deep bank can occlude cells
  // that the worker sees in the shallow version of this same footprint.
  vi.spyOn(g.observation,'explored').mockReturnValue(true);
  return {g,reason:()=>g.canBuild('player.1','building.ants.house',position,actor.id)};
 };
 map.authoring.terrain=editTerrainGrid(map.authoring.terrain,{selection,operation:{type:'water',surfaceLevel:0,depth:'shallow',bankCells:0}}).terrain;
 let current=game();expect(current.g.spatial.walkable(cell)).toBe(true);expect(current.reason()).toBe('Build on dry ground');
 map.authoring.terrain=editTerrainGrid(map.authoring.terrain,{selection,operation:{type:'water',surfaceLevel:0,depth:'deep',bankCells:0}}).terrain;
 current=game();expect(current.g.spatial.walkable(cell)).toBe(false);expect(current.reason()).toBe('Placement blocked');
 map.authoring.terrain=editTerrainGrid(map.authoring.terrain,{selection,operation:{type:'dry',level:0}}).terrain;
 current=game();expect(current.g.spatial.walkable(cell)).toBe(true);expect(current.reason()).toBeNull();
 map.authoring.terrain=editTerrainGrid(map.authoring.terrain,{selection,operation:{type:'ramp',fromLevel:0,toLevel:1,direction:'east'}}).terrain;
 current=game();expect(current.g.spatial.walkable(cell)).toBe(true);expect(current.reason()).toBe('Choose flatter ground');
});
