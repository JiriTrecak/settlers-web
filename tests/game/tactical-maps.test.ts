import {fourCrowns} from '../../scripts/maps/tactical-maps';
import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {parseUtcMap,stringifyUtcMap} from '../../src/shared/map/utcmap';
import {playableMapError} from '../../src/shared/map/playable';
import {Game} from '../../src/sim/game/game';
import {MAX_GROUND_STEP_CM} from '../../src/shared/map/tacticalTerrain';
import {canTraverse} from '../../src/sim/game/navigation';
const load=(id:string)=>parseUtcMap(JSON.parse(readFileSync(`assets/maps/skirmish/${id}.utcmap`,'utf8')))!;
it('ships a playable terrain lab and a four-player 512² FFA with 48 camps and eight T3 encounters',()=>{
 for(const id of ['terrain-proving-ground','four-crowns'])expect(playableMapError(load(id))).toBeNull();
 const map=load('four-crowns');expect(stringifyUtcMap(parseUtcMap(JSON.parse(stringifyUtcMap(fourCrowns())))!)).toBe(stringifyUtcMap(map));expect(map.size).toBe(512);expect(map.playerStarts).toHaveLength(4);expect(map.camps).toHaveLength(48);
 expect(map.camps.filter(c=>c.legendary)).toHaveLength(8);
 expect(map.entities.filter(e=>e.definition==='building.neutral.amber-mine')).toHaveLength(16);
 expect(map.entities.filter(e=>e.definition==='building.neutral.corrupted-root')).toHaveLength(12);
 for(const start of map.playerStarts){
  expect(map.entities.filter(e=>e.definition==='resource.forest.tree'&&Math.hypot(e.position.x-start.x,e.position.y-start.z)<60).length).toBeGreaterThan(150);
 }
});
it('connects all four bases, all camp arenas and all deposits through physical ramps without crossing deep water or trees',()=>{
 const map=load('four-crowns'),g=new Game(map,map.playerStarts.map((s,i)=>({player:i,kind:'human' as const,team:s.player}))),s=g.spatial,n=s.size;
 const seen=new Uint8Array(n*n),queue=new Int32Array(n*n);let head=0,tail=0;
 const origin=s.cell({x:map.playerStarts[0].x,y:map.playerStarts[0].z+8});seen[origin]=1;queue[tail++]=origin;
 const step=(a:number,b:number)=>s.walkable(b)&&Math.abs(s.heights[a]-s.heights[b])<=MAX_GROUND_STEP_CM;
 while(head<tail){const a=queue[head++],x=a%n,y=Math.floor(a/n);
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[-1,-1],[-1,1],[1,-1],[1,1]]){
   const xx=x+dx,yy=y+dy,b=yy*n+xx;if(xx<0||yy<0||xx>=n||yy>=n||seen[b]||!canTraverse(n,a,b,step))continue;
   seen[b]=1;queue[tail++]=b;
  }
 }
 for(const start of map.playerStarts)expect(seen[(start.z+8)*n+start.x],`start ${start.player}`).toBe(1);
 for(const camp of map.camps)expect(seen[camp.home.y*n+camp.home.x],camp.id).toBe(1);
 for(const mine of g.entities.filter(e=>e.resource&&g.context.def(e).kind==='building')){
  expect(Array.from({length:9},(_,i)=>i-4).some(dx=>seen[(mine.y+4)*n+mine.x+dx]||seen[(mine.y-4)*n+mine.x+dx]),mine.placement??undefined).toBe(true);
 }
 expect(tail).toBeGreaterThan(100000);
});
it('continues a four-player FFA after each elimination, rejects defeated orders, and ends only with the last survivor',()=>{
 const map=load('four-crowns'),slots=map.playerStarts.map((s,i)=>({player:i,kind:'human' as const,team:s.player})),g=new Game(map,slots);
 for(const owner of ['player.1','player.2','player.3'] as const){
  g.economy.remove(g.context.get(g.state.objectives[owner])!);g.tick();
  expect(g.isDefeated(owner)).toBe(true);expect(g.entities.some(e=>e.owner===owner)).toBe(false);
  expect(g.command(owner,{type:'stop',actors:[]}).accepted).toBe(false);
  if(owner!=='player.3')expect(g.state.outcome).toBeNull();
 }
 expect(g.state.outcome).toEqual({winner:'player.4',defeated:['player.1','player.2','player.3']});
 const restored=new Game(map,slots);restored.restore(g.snapshot());expect(restored.snapshot()).toEqual(g.snapshot());
});
