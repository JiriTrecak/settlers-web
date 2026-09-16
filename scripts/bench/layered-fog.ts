/** CPU-only atlas benchmark. Run separately from builds/tests; no GPU claims. */
import {performance} from 'node:perf_hooks';
import {FogAtlas} from '../../src/render/visibility/fogAtlas';
const size=512;
for(const overlap of [1,4]){
 const decks:{cell:number;height:number}[]=[];
 for(let bridge=0;bridge<16;bridge++){
  const group=Math.floor(bridge/overlap),x=40+group%4*100,z=40+Math.floor(group/4)*100;
  for(let dz=0;dz<28;dz++)for(let dx=0;dx<6;dx++)decks.push({cell:(z+dz)*size+x+dx,height:400+bridge%overlap*500});
 }
 const start=performance.now(),atlas=new FogAtlas(size,decks),constructionMs=performance.now()-start,samples:number[]=[];
 let cells=new Uint8Array(size*size+decks.length);atlas.update(cells);
 for(let frame=0;frame<100;frame++){
  cells=cells.slice();
  for(let z=20;z<90;z++)for(let x=20;x<100;x++)cells[z*size+x]=Math.hypot(x-(40+frame%30),z-52)<19?2:cells[z*size+x]?1:0;
  for(let i=0;i<decks.length;i++)cells[size*size+i]=cells[decks[i]!.cell]!;
  const begin=performance.now();atlas.update(cells,frame);if(frame>=10)samples.push(performance.now()-begin);
 }
 samples.sort((a,b)=>a-b);
 console.log(JSON.stringify({size,bridges:16,overlap,deckCells:decks.length,tiles:atlas.count,textureBytes:atlas.texture.image.data!.byteLength,constructionMs,updateMeanMs:samples.reduce((a,b)=>a+b,0)/samples.length,updateP95Ms:samples[Math.floor(samples.length*.95)]}));atlas.dispose();
}
