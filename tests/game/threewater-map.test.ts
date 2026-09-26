import {beforeAll,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {Game} from '../../src/sim/game/game';
import {parseUtcMap} from '../../src/shared/map/utcmap';
import {playableMapError} from '../../src/shared/map/playable';
import {projectScene} from '../../src/shared/authoring/project';
import {bridgeSurfaces} from '../../src/shared/map/bridgeSurface';
import {precise} from '../../src/sim/game/motion';
const map=parseUtcMap(JSON.parse(readFileSync('assets/maps/skirmish/threewater-forest.utcmap','utf8')))!;
let game:Game;
function near(x:number,y:number,r=5){
 let result=-1,best=Infinity;const s=game.spatial;
 for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){
  const p={x:Math.round(x+dx),y:Math.round(y+dz)},id=s.cell(p),distance=Math.hypot(p.x-x,p.y-y);
  if(s.walkable(id)&&distance<best){result=id;best=distance;}
 }
 expect(result).toBeGreaterThanOrEqual(0);return result;
}
describe('Threewater authored battlefield',()=>{
 beforeAll(()=>{game=new Game(map,[{player:0,kind:'human'},{player:1,kind:'human'}]);});
 it('loads a complete playable scene',()=>{
  expect(playableMapError(map)).toBeNull();expect(projectScene(map)!.generated!.issues).toEqual([]);
 });
 it('preserves clear flat construction cores and real barracks placement for both players',()=>{
  for(const b of map.playerStarts){
   const owner=`player.${b.player}` as const,worker=game.entities.find(e=>e.owner===owner&&game.registry.get(e.definition).behaviors.work?.builds.length)!;
   let valid=0;
   for(let z=b.z-15;z<=b.z+15;z++)for(let x=b.x-15;x<=b.x+15;x++){
    const i=z*map.size+x;expect(game.spatial.resources[i]).toBe(0);expect(game.spatial.terrain[i]).toBe(1);
    expect(Math.abs(game.spatial.heights[i]!)).toBeLessThanOrEqual(1);
   }
   for(let z=b.z-12;z<=b.z+12;z+=4)for(let x=b.x-12;x<=b.x+12;x+=4)
    if(game.canBuild(owner,'building.ants.barracks',{x,y:z},worker.id)===null)valid++;
   expect(valid).toBeGreaterThanOrEqual(25);
  }
 });
 it('connects bases and all six amber deposits without removing trees',()=>{
  const starts=map.playerStarts.map(b=>near(b.x,b.z));
  expect(game.spatial.findPath(starts[0]!,starts[1]!)).not.toBeNull();
  for(const mine of map.entities.filter(e=>e.definition==='building.neutral.amber-mine')){
   const destination=near(mine.position.x,mine.position.y,10);
   expect(game.spatial.findPath(starts[0]!,destination),mine.id).not.toBeNull();
  }
 });
 it.each([0,1,2])('walks a commanded settler over crossing %i and back to ground',index=>{
  const scene=projectScene(map)!,b=bridgeSurfaces(scene.stamps,(x,z)=>scene.field.sample(x,z)).find(b=>b.id==='bridge.'+index)!;
  const ends=[-1,1].map(sign=>game.spatial.point(near(b.x+b.s*sign*(b.depth/2+2),b.z+b.c*sign*(b.depth/2+2),3)));
  const path=game.spatial.findPath(game.spatial.cell(ends[0]!),game.spatial.cell(ends[1]!))!;
  expect(path.length).toBeLessThan(45);expect(path.some(n=>game.spatial.point(n).surface===b.id)).toBe(true);
  const unit=game.context.create({id:'crossing-probe.'+index,definition:'unit.ants.settler',owner:'player.1',position:ends[0]!,rotation:0});unit.readyTick=0;
  expect(game.command('player.1',{type:'move',actors:[unit.id],destination:ends[1]!}).accepted).toBe(true);
  let onDeck=false,arrived=false;
  for(let n=0;n<600;n++){
   game.tick();onDeck ||= unit.surface===b.id;
   const p=precise(unit);if(Math.hypot(p.x-ends[1]!.x,p.y-ends[1]!.y)<.15&&!unit.surface){arrived=true;break;}
  }
  expect(onDeck).toBe(true);expect(arrived).toBe(true);
 });
});
