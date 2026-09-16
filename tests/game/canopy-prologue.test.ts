import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
import {parseUtcMap} from '../../src/shared/map/utcmap';
import {playableMapError} from '../../src/shared/map/playable';
import {Game} from '../../src/sim/game/game';
import {MAX_GROUND_STEP_CM} from '../../src/shared/map/tacticalTerrain';
import {canTraverse} from '../../src/sim/game/navigation';
it.each(['vanguard-prologue','vanguard-hearth','vanguard-root'])('connects every %s objective and camp through the full dense forest, including giant-root collision',(id)=>{
 const map=parseUtcMap(JSON.parse(readFileSync(`assets/maps/campaign/${id}.utcmap`,'utf8')))!;
 expect(playableMapError(map)).toBeNull();
 expect(map.stamps.filter(s=>s.asset==='ancient-canopy-trunk').length).toBeGreaterThan(8);
 expect(map.entities.filter(e=>e.definition==='resource.forest.tree').length).toBeGreaterThan(2500);
 const g=new Game(map,[{player:0,kind:'human'}]),s=g.spatial,n=s.size;
 const seen=new Uint8Array(n*n),queue=new Int32Array(n*n);let head=0,tail=0;
 const hero=g.entities.find(e=>e.placement==='marshal')!,origin=s.cell(hero);seen[origin]=1;queue[tail++]=origin;
 const step=(a:number,b:number)=>s.walkable(b)&&Math.abs(s.heights[a]-s.heights[b])<=MAX_GROUND_STEP_CM;
 while(head<tail){const a=queue[head++],x=a%n,y=Math.floor(a/n);
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[-1,-1],[-1,1],[1,-1],[1,1]]){
   const xx=x+dx,yy=y+dy,b=yy*n+xx;if(xx<0||yy<0||xx>=n||yy>=n||seen[b]||!canTraverse(n,a,b,step))continue;
   seen[b]=1;queue[tail++]=b;
  }
 }
 for(const r of map.mission!.regions)expect.soft(seen[r.y*n+r.x],r.id).toBe(1);
 for(const c of map.camps)expect.soft(seen[c.home.y*n+c.home.x],c.id).toBe(1);
 for(const p of id==='vanguard-prologue'?[{x:189,y:193},{x:192,y:196},{x:187,y:197}]:[])expect(seen[s.cell(p)],'Opening conversation spot').toBe(1);
});
