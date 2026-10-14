import {expect,it} from 'vitest';
import {rankApproachPositions,type ApproachPosition} from '../../src/sim/game/attackPositions';
import {SimulationProfiler} from '../../src/sim/profiling';

it('matches complete score sorting, including ties, reservations and fractional band boundaries',()=>{
 let seed=841;const random=(n:number)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 for(let scene=0;scene<30;scene++){
  const origin={x:random(1000)/7,y:random(1000)/7};
  const entries:ApproachPosition[]=Array.from({length:1000},()=>({point:{x:random(2000)/10,y:random(2000)/10},clear:random(4)===0?false:undefined}));
  for(const dx of [0,.999999999,1,1.000000001,4,5])for(const direction of [-1,1]){
   const point={x:origin.x+dx*direction,y:origin.y};entries.push({point},{point:{...point}});
  }
  const reserved=(p:{x:number;y:number})=>Math.floor(p.x+p.y)%3===0;
  const reference=entries.filter(entry=>entry.clear!==false).map((entry,index)=>({entry,index,point:entry.point,
   score:Math.hypot(entry.point.x-origin.x,entry.point.y-origin.y)+(reserved(entry.point)?4:0)}))
   .sort((a,b)=>a.score-b.score||a.point.y-b.point.y||a.point.x-b.point.x||a.index-b.index);
  expect([...rankApproachPositions(entries,origin,reserved)]).toEqual(reference);
 }
});

it('orders only consumed bands and retains the initial candidate snapshot during lazy validation',()=>{
 const profile=new SimulationProfiler();profile.enabled=true;
 const entries:ApproachPosition[]=Array.from({length:1000},(_,x)=>({point:{x,y:0}}));
 const ranked=rankApproachPositions(entries,{x:0,y:0},()=>false,profile)[Symbol.iterator]();
 expect(ranked.next().value?.entry).toBe(entries[0]);
 entries[1]!.clear=false; // The old eager filter already included this entry.
 expect(ranked.next().value?.entry).toBe(entries[1]);
 ranked.return?.();
 expect(profile.workSnapshot().find(r=>r.path==='Approach entries ordered')?.value).toBe(2);
 expect(profile.workSnapshot().find(r=>r.path==='Approach ranking entries')?.value).toBe(1000);
});
