/** Synthetic algorithm scaling, not a claim that the game accepts 1024² maps. */
import {writeFileSync} from 'node:fs';
import {SectorNavigation} from '../../src/sim/game/sectorNavigation';
import {Navigation} from '../../src/sim/game/navigation';
import {SectorIndex} from '../../src/shared/spatial/sectors';
const report=[];
const stats=(values:number[])=>{const a=[...values].sort((x,y)=>x-y);return {mean:values.reduce((a,b)=>a+b,0)/values.length,p95:a[Math.floor(a.length*.95)],max:a.at(-1)};};
for(const size of [128,256,512,1024]){
 const blocked=new Uint8Array(size*size);
 for(let y=Math.floor(size*.25);y<size*.75;y++)for(let x=Math.floor(size*.4);x<size*.6;x++)blocked[y*size+x]=1;
 const walk=(i:number)=>!blocked[i],step=(_a:number,b:number)=>walk(b);
 let begin=performance.now();const graph=new SectorNavigation(size,walk,step);graph.prepare();const buildMs=performance.now()-begin;
 const plain=new Navigation(size,step,undefined,true),hierarchy=new Navigation(size,step,(a,b)=>graph.connected(a,b),true);
 const fullMs:number[]=[],sectorMs:number[]=[],fullCells:number[]=[],sectorCells:number[]=[],inflation:number[]=[];
 for(let i=0;i<24;i++){
  const start=(Math.floor(size*.5)+i%5)*size+Math.floor(size*.125),goal=(Math.floor(size*.5)+i%3)*size+Math.floor(size*.875);
  begin=performance.now();const full=plain.path(start,goal)!;const ms=performance.now()-begin;
  const expanded=plain.lastExpanded;
  begin=performance.now();const mask=graph.corridor(start,goal)!;const path=hierarchy.path(start,goal,undefined,Infinity,mask)!;const hs=performance.now()-begin;
  if(!full||!path)throw Error('Expected route around the lake');
  const cost=(path:number[])=>{let a=start,total=0;for(const b of path){total+=a%size!==b%size&&Math.floor(a/size)!==Math.floor(b/size)?1414:1000;a=b;}return total;};
  if(i>=4){fullMs.push(ms);sectorMs.push(hs);fullCells.push(expanded);sectorCells.push(hierarchy.lastExpanded);inflation.push(cost(path)/cost(full));}
 }
 const index=new SectorIndex<number>();let population=0;
 for(let y=0;y<size;y+=4)for(let x=0;x<size;x+=4){const id=y*size+x;index.set(id,id,{minX:x,minY:y,maxX:x,maxY:y});population++;}
 begin=performance.now();let count=0;for(let i=0;i<1000;i++)count=[...index.query({minX:32,minY:32,maxX:47,maxY:47})].length;
 const localQueryMs=(performance.now()-begin)/1000;
 const entry={size,buildMs,population,localQueryMs,localCount:count,localVisits:index.visits,full:{ms:stats(fullMs),cells:stats(fullCells)},sector:{ms:stats(sectorMs),cells:stats(sectorCells)},maxRouteCostRatio:Math.max(...inflation)};
 report.push(entry);console.log(JSON.stringify(entry));
}
const at=process.argv.indexOf('--output'),file=at>=0?process.argv[at+1]!:'/tmp/sector-scaling.json';writeFileSync(file,JSON.stringify(report,null,2)+'\n');
