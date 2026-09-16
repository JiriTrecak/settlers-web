import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
import {parseUtcMap} from '../../src/shared/map/utcmap';
import {playableMapError} from '../../src/shared/map/playable';
import {Game} from '../../src/sim/game/game';
import {MAX_GROUND_STEP_CM} from '../../src/shared/map/tacticalTerrain';
import {canTraverse} from '../../src/sim/game/navigation';
const map=parseUtcMap(JSON.parse(readFileSync('assets/maps/skirmish/canopy-clearing.utcmap','utf8')))!;
it('keeps dense timber groves, both bases and resource entrances connected around solid giant trunks',()=>{
 expect(playableMapError(map)).toBeNull();
 const g=new Game(map,map.playerStarts.map((s,i)=>({player:i,kind:'human' as const,team:s.player}))),s=g.spatial,n=s.size;
 const seen=new Uint8Array(n*n),queue=new Int32Array(n*n);let head=0,tail=0;
 const origin=s.cell({x:map.playerStarts[0].x,y:map.playerStarts[0].z+8});seen[origin]=1;queue[tail++]=origin;
 const step=(a:number,b:number)=>s.walkable(b)&&Math.abs(s.heights[a]-s.heights[b])<=MAX_GROUND_STEP_CM;
 while(head<tail){const a=queue[head++],x=a%n,y=Math.floor(a/n);
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[-1,-1],[-1,1],[1,-1],[1,1]]){
   const xx=x+dx,yy=y+dy,b=yy*n+xx;if(xx<0||yy<0||xx>=n||yy>=n||seen[b]||!canTraverse(n,a,b,step))continue;
   seen[b]=1;queue[tail++]=b;
  }
 }
 for(const start of map.playerStarts){
  expect(seen[(start.z+8)*n+start.x],`Player ${start.player} access`).toBe(1);
  const trees=g.entities.filter(e=>e.definition==='resource.forest.tree'&&Math.hypot(e.x-start.x,e.y-start.z)<32);
  expect(trees.length,'Nearby harvestable timber').toBeGreaterThan(35);
  expect(trees.filter(t=>[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>seen[(t.y+dy)*n+t.x+dx])).length,'Reachable grove boundary').toBeGreaterThan(12);
 }
 for(const e of g.entities.filter(e=>g.context.def(e).kind==='building')){
  const entrance=s.entrance(e);expect.soft(seen[s.cell(entrance)],e.placement??e.definition).toBe(1);
 }
 for(const p of map.stamps.filter(p=>p.asset==='ancient-canopy-trunk'))expect(s.terrain[Math.round(p.y)*n+Math.round(p.x)],'Solid trunk').toBe(0);
});
