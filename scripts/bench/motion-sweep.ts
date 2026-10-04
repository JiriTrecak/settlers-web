/** Isolated collision sweep cost; does not measure whole-match frame rate. */
import {clearSweep} from '../../src/sim/game/motion';
import {clearSweep as previous} from '../../tests/fixtures/motion-sweep';
let seed=713;
const random=(n:number)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
const paths=Array.from({length:20000},(_,i)=>{
 const from={x:random(510000)+1000,y:random(510000)+1000};
 return {from,to:{x:from.x+random(i%5?400:16000)-200,y:from.y+random(i%5?400:16000)-200},radius:[340,595,850,1190][i%4]!};
});
const step=(a:number,b:number)=>(a*17+b*31)%101!==0;
let expected:number|undefined;
for(const [label,sweep] of [['before',previous],['after',clearSweep],['after',clearSweep],['before',previous]] as const){
 const samples:number[]=[];let accepted=0;
 for(let round=0;round<10;round++){
  accepted=0;const start=performance.now();
  for(const p of paths)accepted+=+sweep(p.from,p.to,step,512,p.radius);
  if(round>=2)samples.push(performance.now()-start);
 }
 expected??=accepted;if(accepted!==expected)throw Error('Collision result changed');
 console.log(JSON.stringify({label,queries:paths.length,accepted,meanMs:samples.reduce((a,b)=>a+b,0)/samples.length}));
}
