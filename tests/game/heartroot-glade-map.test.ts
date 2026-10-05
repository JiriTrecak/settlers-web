// Heartroot Glade: the 4-player 512 map must follow docs/game/map-design.md — fair under 90° rotation,
// connected, Root contested away from bases, camps tucked off the walking routes.
import {CAMP_LOOT,campCompositions} from "../../src/content/campCompositions";
import {beforeAll,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {Game} from '../../src/sim/game/game';
import {parseUtcMap} from '../../src/shared/map/utcmap';
import {playableMapError} from '../../src/shared/map/playable';
import {projectScene} from '../../src/shared/authoring/project';
import {fixed,precise} from '../../src/sim/game/motion';
import {farthestClearWaypoint} from '../../src/sim/game/routeSmoothing';
const map=parseUtcMap(JSON.parse(readFileSync('assets/maps/skirmish/heartroot-glade.utcmap','utf8')))!;
const S=map.size;
/** The map's symmetry: player k+1's share is player k's turned 90° about the centre. */
const rot=(p:{x:number;y:number})=>({x:S-p.y,y:p.x});
let game:Game;
function near(x:number,y:number,r=6){
 let result=-1,best=Infinity;const s=game.spatial;
 for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){
  const p={x:Math.round(x+dx),y:Math.round(y+dz)},id=s.cell(p),distance=Math.hypot(p.x-x,p.y-y);
  if(s.walkable(id)&&distance<best){result=id;best=distance;}
 }
 expect(result).toBeGreaterThanOrEqual(0);return result;
}
const length=(path:number[],start:number)=>{
 const s=game.spatial;let anchor=s.point(start),sum=0;
 for(let i=0;i<path.length;){
  const j=farthestClearWaypoint(i,path.length-1,n=>s.clearSegment(fixed(anchor),fixed(s.point(path[n]!))));
  const end=s.point(path[j]!);sum+=Math.hypot(end.x-anchor.x,end.y-anchor.y);anchor=end;i=j+1;
 }
 return sum;
};
const starts=()=>map.playerStarts.map(b=>{
 const toward={x:S/2-b.x,y:S/2-b.z},l=Math.hypot(toward.x,toward.y);
 return near(b.x+toward.x/l*14,b.z+toward.y/l*14);
});
describe('Heartroot Glade',()=>{
 beforeAll(()=>{game=new Game(map,[0,1,2,3].map(player=>({player,kind:'human' as const})));},120_000);
 it('loads a complete playable scene',()=>{
  expect(map.size).toBe(512);expect(map.playerStarts).toHaveLength(4);
  expect(playableMapError(map)).toBeNull();
  expect(projectScene(map)!.generated!.issues.filter(i=>i.code!=='object-water-conflict')).toEqual([]);
 });
 it('gives every player flat building room and pines within harvest reach',()=>{
  for(const b of map.playerStarts){
   const owner=`player.${b.player}` as const,worker=game.entities.find(e=>e.owner===owner&&game.registry.get(e.definition).behaviors.work?.builds.length)!;
   for(let z=b.z-15;z<=b.z+15;z++)for(let x=b.x-15;x<=b.x+15;x++){
    const i=z*S+x;expect(game.spatial.resources[i]).toBe(0);expect(game.spatial.terrain[i]).toBe(1);
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
    if(Math.hypot(x-b.x,z-b.z)<=34&&game.spatial.resources[z*S+x])trees++;
   expect(trees,`trees near player ${b.player}`).toBeGreaterThanOrEqual(40);
  }
 });
 it('keeps neighbour and cross distances equal for every player',()=>{
  const s=starts(),path=(a:number,b:number)=>length(game.spatial.findPath(s[a]!,s[b]!)!,s[a]!);
  const neighbours=[0,1,2,3].map(k=>path(k,(k+1)%4)),cross=[path(0,2),path(1,3)];
  for(const d of neighbours)expect(Math.abs(d/neighbours[0]!-1)).toBeLessThan(.03);
  expect(Math.abs(cross[1]!/cross[0]!-1)).toBeLessThan(.03);
 });
 it('rotates every deposit into every share and connects it to its owner',()=>{
  const s=starts();
  for(const e of map.entities.filter(e=>e.owner==='none'&&/^(amber|root)\./.test(e.id))){
   const [family,k]=[e.id.replace(/\.\d$/,''),Number(e.id.slice(-1))];
   const twin=map.entities.find(t=>t.id===`${family}.${k%4+1}`)!;
   expect(twin.position,e.id).toEqual(rot(e.position));
   expect(game.spatial.findPath(s[k-1]!,near(e.position.x,e.position.y,10)),e.id).not.toBeNull();
  }
 });
 it('makes the natural clearly its owner\'s and keeps Root out of every base',()=>{
  for(const e of map.entities.filter(e=>e.id.startsWith('amber.natural.'))){
   const d=map.playerStarts.map(b=>Math.hypot(b.x-e.position.x,b.z-e.position.y)).sort((a,b)=>a-b);
   expect(d[0]).toBeGreaterThanOrEqual(60);expect(d[0]).toBeLessThanOrEqual(90);expect(d[1]!/d[0]!).toBeGreaterThanOrEqual(2);
  }
  const roots=map.entities.filter(e=>e.definition==='building.neutral.corrupted-root');
  expect(roots.length).toBe(12);
  for(const r of roots)for(const b of map.playerStarts)expect(Math.hypot(b.x-r.position.x,b.z-r.position.y),r.id).toBeGreaterThan(100);
  expect(roots.length*game.registry.get('building.neutral.corrupted-root').yield!).toBeGreaterThanOrEqual(3*4*100);
 });
 it('rotates reachable camps of every tier that never leash into a base',()=>{
  expect(map.camps).toHaveLength(48);
  const tier=new Map(campCompositions.map(c=>[CAMP_LOOT[c.difficulty],c.difficulty]));
  const count=(t:string)=>map.camps.filter(c=>tier.get(c.lootPool!)===t).length;
  expect([count('small'),count('medium'),count('hard')]).toEqual([24,16,8]);
  const home=near(map.playerStarts[0]!.x+20,map.playerStarts[0]!.z-20);
  for(const camp of map.camps){
   const k=Number(camp.id.slice(-1)),twin=map.camps.find(c=>c.id===camp.id.replace(/\d$/,String(k%4+1)))!;
   expect(twin.home,camp.id).toEqual(rot(camp.home));
   for(const b of map.playerStarts)expect(Math.hypot(camp.home.x-b.x,camp.home.y-b.z),camp.id).toBeGreaterThan(camp.aggroRange+camp.leash+10);
   const at=near(camp.home.x,camp.home.y);
   // Player 1's share is walked from its base; the rest follow by rotation.
   if(k===1)expect(game.spatial.findPath(home,at),camp.id).not.toBeNull();
   for(const id of camp.members){
    const p=precise(game.entities.find(e=>e.placement===id)!),cell=game.spatial.cell({x:Math.round(p.x),y:Math.round(p.y)});
    expect(game.spatial.walkable(cell),id).toBe(true);
   }
  }
 },120_000);
 it('lets armies march base to base without pulling a camp',()=>{
  const s=starts();
  const routes=[s[1]!,s[2]!].map(goal=>{
   const spatial=game.spatial,path=spatial.findPath(s[0]!,goal)!,out=[spatial.point(s[0]!)];
   // Test the route actually followed after smoothing, not unused raster cells.
   // Sample segments as well as waypoints so a shortcut cannot hide a camp pull.
   let anchor=out[0]!;
   for(let i=0;i<path.length;){
    const j=farthestClearWaypoint(i,path.length-1,n=>spatial.clearSegment(fixed(anchor),fixed(spatial.point(path[n]!))));
    const end=spatial.point(path[j]!),steps=Math.ceil(Math.hypot(end.x-anchor.x,end.y-anchor.y)*4);
    for(let n=1;n<=steps;n++)out.push({x:anchor.x+(end.x-anchor.x)*n/steps,y:anchor.y+(end.y-anchor.y)*n/steps});
    anchor=end;i=j+1;
   }
   return out;
  });
  // Every rotation of the neighbour and cross routes is an equally likely march.
  const all=routes.flatMap(r=>[0,1,2,3].flatMap(k=>r.map(p=>{let q={x:p.x,y:p.y};for(let i=0;i<k;i++)q=rot(q);return q;})));
  for(const camp of map.camps)for(const id of camp.members){
   const p=precise(game.entities.find(e=>e.placement===id)!);
   let closest=Infinity;for(const q of all)closest=Math.min(closest,Math.hypot(q.x-p.x,q.y-p.y));
   expect(closest,id).toBeGreaterThan(camp.aggroRange+3);
  }
 },60_000);
});
