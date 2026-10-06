/** Paired cold-edge searches on real map collision geometry, not frame timing. */
import {readFileSync} from 'node:fs';
import {World} from '../../src/sim/world/world';
import {parseUtcMap} from '../../src/shared/map/utcmap';
import {Navigation,canTraverse} from '../../src/sim/game/navigation';
import {fixed} from '../../src/sim/game/motion';
const map=parseUtcMap(JSON.parse(readFileSync('assets/maps/skirmish/amberwake-basin.utcmap','utf8')))!;
const world=new World({map,slots:map.playerStarts.map((_,i)=>({player:i,kind:'ai',team:i})),seed:731942}),spatial=world.settlement.spatial;
if(spatial.layers)throw Error('This benchmark covers ground navigation');
const pairs=[[92732,89149],[237228,234154],[237226,234153],[238253,233642],[191038,196164],[191036,196676],[196676,183350]];
const directions=[[0,-1],[-1,0],[1,0],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
let oracle:string|undefined;
for(const eager of [true,false,false,true]){
 let probes=0;
 const step=(a:number,b:number)=>{probes++;return spatial.clearSegment(fixed(spatial.point(a)),fixed(spatial.point(b)));};
 const nav=new Navigation(spatial.size,step,(a,b)=>spatial.sectors.connected(a,b),true);
 if(eager){
  // Previous production eager edge-mask algorithm, isolated to this benchmark.
  const internal=nav as unknown as {edges:Uint8Array;knownEdges:Uint8Array;edge:(a:number,b:number,bit:number)=>boolean};
  internal.edge=(a,_b,bit)=>{
   if(!internal.knownEdges[a]){
    const x=a%spatial.size,y=Math.floor(a/spatial.size);let mask=0;
    directions.forEach(([dx,dy],i)=>{const nx=x+dx!,ny=y+dy!;
     if(nx>=0&&ny>=0&&nx<spatial.size&&ny<spatial.size&&canTraverse(spatial.size,a,ny*spatial.size+nx,step))mask|=1<<i;
    });
    internal.knownEdges[a]=255;internal.edges[a]=mask;
   }
   return !!(internal.edges[a]!&bit);
  };
 }
 const times:number[]=[],routes:string[]=[];let measuredProbes=0;
 for(let pass=0;pass<6;pass++){
  nav.invalidate();probes=0;
  for(const [from,to] of pairs){const begin=performance.now(),route=nav.path(from!,to!);
   if(pass)times.push(performance.now()-begin);if(pass===5)routes.push(JSON.stringify(route));
  }
  if(pass)measuredProbes+=probes;
 }
 const signature=JSON.stringify(routes);oracle??=signature;if(signature!==oracle)throw Error('Route mismatch');
 const sorted=[...times].sort((a,b)=>a-b);
 console.log(JSON.stringify({eager,searches:times.length,collisionProbes:measuredProbes,mean:times.reduce((a,b)=>a+b,0)/times.length,p95:sorted[Math.floor(sorted.length*.95)],max:sorted.at(-1),routeLengths:routes.map(r=>JSON.parse(r)?.length??null)}));
}
