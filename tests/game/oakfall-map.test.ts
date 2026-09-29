// Oakfall Hollow: the mega-scenery showcase must still be a fair, fully connected skirmish map.
import {beforeAll,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {Game} from '../../src/sim/game/game';
import {parseUtcMap} from '../../src/shared/map/utcmap';
import {playableMapError} from '../../src/shared/map/playable';
import {projectScene} from '../../src/shared/authoring/project';
import {bridgeSurfaces} from '../../src/shared/map/bridgeSurface';
import {precise} from '../../src/sim/game/motion';
const map=parseUtcMap(JSON.parse(readFileSync('assets/maps/skirmish/oakfall-hollow.utcmap','utf8')))!;
let game:Game;
function near(x:number,y:number,r=5){
 let result=-1,best=Infinity;const s=game.spatial;
 for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){
  const p={x:Math.round(x+dx),y:Math.round(y+dz)},id=s.cell(p),distance=Math.hypot(p.x-x,p.y-y);
  if(s.walkable(id)&&distance<best){result=id;best=distance;}
 }
 expect(result).toBeGreaterThanOrEqual(0);return result;
}
describe('Oakfall Hollow',()=>{
 beforeAll(()=>{game=new Game(map,[{player:0,kind:'human'},{player:1,kind:'human'}]);},30_000);
 it('loads a complete playable scene',()=>{
  expect(playableMapError(map)).toBeNull();
  // Logs lying in the meres and reeds at the banks overlap water on purpose.
  expect(projectScene(map)!.generated!.issues.filter(i=>i.code!=='object-water-conflict')).toEqual([]);
 });
 it('gives both players flat building room and pines within harvest reach',()=>{
  for(const b of map.playerStarts){
   const owner=`player.${b.player}` as const,worker=game.entities.find(e=>e.owner===owner&&game.registry.get(e.definition).behaviors.work?.builds.length)!;
   for(let z=b.z-15;z<=b.z+15;z++)for(let x=b.x-15;x<=b.x+15;x++){
    const i=z*map.size+x;expect(game.spatial.resources[i]).toBe(0);expect(game.spatial.terrain[i]).toBe(1);
    expect(Math.abs(game.spatial.heights[i]!)).toBeLessThanOrEqual(1);
   }
   const hall=game.registry.get(game.registry.rules.startingSetup.fort).footprint!;
   const barracks=game.registry.get('building.ants.barracks').footprint!;
   const radius=Math.ceil((Math.max(hall.width,hall.depth)+Math.max(barracks.width,barracks.depth))/2)+4;
   let valid=0;
   for(let z=b.z-radius;z<=b.z+radius;z+=4)for(let x=b.x-radius;x<=b.x+radius;x+=4)
    if(game.canBuild(owner,'building.ants.barracks',{x,y:z},worker.id)===null)valid++;
   expect(valid).toBeGreaterThanOrEqual(25);
   let trees=0;
   for(let z=b.z-34;z<=b.z+34;z++)for(let x=b.x-34;x<=b.x+34;x++)
    if(x>=0&&z>=0&&x<map.size&&z<map.size&&Math.hypot(x-b.x,z-b.z)<=34&&game.spatial.resources[z*map.size+x])trees++;
   expect(trees,`trees near player ${b.player}`).toBeGreaterThanOrEqual(40);
  }
 });
 it('connects both bases to each other and to every amber deposit',()=>{
  const starts=map.playerStarts.map(b=>{
   const hall=game.entities.find(e=>e.placement===b.mainFort)!;
   const entrance=game.spatial.entrance(hall);return near(entrance.x,entrance.y);
  });
  expect(game.spatial.findPath(starts[0]!,starts[1]!)).not.toBeNull();
  for(const mine of map.entities.filter(e=>e.definition==='building.neutral.amber-mine'))
   for(const start of starts)expect(game.spatial.findPath(start,near(mine.position.x,mine.position.y,10)),mine.id).not.toBeNull();
 });
 it('mirrors reachable neutral camps that never leash into a base',()=>{
  expect(map.camps).toHaveLength(14);
  const starts=map.playerStarts.map(b=>near(b.x,b.z+14));
  for(const camp of map.camps){
   const twin=map.camps.find(c=>c.id===camp.id.replace(/[ab]$/,s=>s==='a'?'b':'a'))!;
   expect(twin.home).toEqual({x:map.size-camp.home.x,y:map.size-camp.home.y});
   for(const b of map.playerStarts)expect(Math.hypot(camp.home.x-b.x,camp.home.y-b.z),camp.id).toBeGreaterThan(camp.aggroRange+camp.leash+10);
   for(const id of camp.members){
    const p=precise(game.entities.find(e=>e.placement===id||e.id===id)!),at=game.spatial.cell({x:Math.round(p.x),y:Math.round(p.y)});
    expect(game.spatial.walkable(at),id).toBe(true);
    for(const start of starts)expect(game.spatial.findPath(start,at),id).not.toBeNull();
   }
  }
 });
 it.each([0,1])('walks a settler over brook bridge %i and back to ground',index=>{
  const scene=projectScene(map)!,b=bridgeSurfaces(scene.stamps,(x,z)=>scene.field.sample(x,z))[index]!;
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
