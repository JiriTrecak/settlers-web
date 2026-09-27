import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {parseUtcMap} from '../../src/shared/map/utcmap';
import {playableMapError} from '../../src/shared/map/playable';
import {projectScene} from '../../src/shared/authoring/project';
import {Game} from '../../src/sim/game/game';
const maps=['forest','frost'].map(kind=>parseUtcMap(JSON.parse(readFileSync(`assets/maps/skirmish/crown-marsh-${kind}.utcmap`,'utf8')))!);
for(const map of maps)describe(map.name,()=>{
 it('is a valid four-player map with equal amber access and no missing assets',()=>{
  expect(playableMapError(map)).toBeNull();expect(map.playerStarts.map(p=>p.player)).toEqual([1,2,3,4]);
  expect(map.entities.filter(e=>e.definition==='building.neutral.amber-mine')).toHaveLength(8);
  expect(projectScene(map)!.generated!.issues.filter(i=>i.code!=='object-water-conflict')).toEqual([]);
  for(const p of map.playerStarts){const distances=map.entities.map(e=>Math.hypot(e.position.x-p.x,e.position.y-p.z));expect(Math.min(...distances)).toBeCloseTo(Math.hypot(24,3));}
 });
 it('supports construction at all four bases and connects every base and amber mine',()=>{
  const game=new Game(map,[{player:0,kind:'human'},{player:1,kind:'human'},{player:2,kind:'human'},{player:3,kind:'human'}]);
  const s=game.spatial;
  const near=(x:number,y:number,r=9)=>{let id=-1,best=Infinity;for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){const cell=s.cell({x:Math.round(x+dx),y:Math.round(y+dz)}),d=dx*dx+dz*dz;if(s.walkable(cell)&&d<best){id=cell;best=d;}}expect(id).toBeGreaterThanOrEqual(0);return id;};
  const entrances=map.playerStarts.map(p=>{const hall=game.entities.find(e=>e.placement===p.mainFort)!;expect(hall).toBeTruthy();const e=s.entrance(hall);return near(e.x,e.y);});
  for(const p of map.playerStarts){
   const owner=`player.${p.player}` as const,worker=game.entities.find(e=>e.owner===owner&&game.registry.get(e.definition).behaviors.work?.builds.length)!;
   let sites=0;for(let z=p.z-18;z<=p.z+18;z+=3)for(let x=p.x-18;x<=p.x+18;x+=3)if(game.canBuild(owner,'building.ants.barracks',{x,y:z},worker.id)===null)sites++;
   expect(sites).toBeGreaterThan(15);
  }
  for(const end of entrances.slice(1))expect(s.findPath(entrances[0]!,end)).not.toBeNull();
  for(const e of map.entities)expect(s.findPath(entrances[0]!,near(e.position.x,e.position.y)),e.id).not.toBeNull();
 });
});
it('preserves identical terrain, starts and economic layout between biomes',()=>{
 expect(maps[1]!.playerStarts).toEqual(maps[0]!.playerStarts);expect(maps[1]!.entities).toEqual(maps[0]!.entities);
 expect(Array.from(projectScene(maps[1]!)!.field.samples)).toEqual(Array.from(projectScene(maps[0]!)!.field.samples));
 const shapes=(m:typeof maps[number])=>Object.fromEntries(m.authoring!.layers.map(l=>[l.id,l.shape]));expect(shapes(maps[1]!)).toEqual(shapes(maps[0]!));
});
