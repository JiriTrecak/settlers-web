import {beforeAll, describe, expect, it} from 'vitest';
import {init} from 'recast-navigation';
import {buildProbe, checkProbePath, disposeProbe, groundGeometry, queryProbe} from '../../scripts/bench/navigation/recast-probe';
import {clearSweep, fixed} from '../../src/sim/game/motion';

beforeAll(async()=>{await init();});
describe('experimental navmesh global-route acceptance',()=>{
 it('keeps blocked cells out of input geometry and emits upward faces',()=>{
  const g=groundGeometry({size:2,walkable:i=>i===1,height:()=>3});
  expect(g.positions.length).toBe(12);expect(g.indices.length).toBe(6);
  const [a,b,c]=g.indices.map(i=>g.positions.slice(i*3,i*3+3));
  const normalY=(b![2]!-a![2]!)*(c![0]!-a![0]!)-(b![0]!-a![0]!)*(c![2]!-a![2]!);
  expect(normalY).toBeGreaterThan(0);
  expect(g.positions.filter((_,i)=>i%3===1)).toEqual([3,3,3,3]);
 });
 it('rejects successful-looking partial or relocated routes',()=>{
  const a={x:1,y:0,z:1},b={x:20,y:0,z:1};
  expect(checkProbePath([a,{...b,x:19}],a,b,()=>true).valid).toBe(false);
  expect(checkProbePath([{...a,x:2},b],a,b,()=>true).valid).toBe(false);
  expect(checkProbePath([],a,b,()=>true).valid).toBe(false);
  expect(checkProbePath([a,{...b,y:2}],a,b,()=>true).valid).toBe(false);
 });
 it('checks the full body along every segment, including exact endpoints',()=>{
  const a={x:1,y:0,z:1},b={x:20,y:0,z:1};
  expect(checkProbePath([a,b],a,b,(p,q)=>Math.abs(p.x-q.x)<2).reason).toBe('clearance');
  expect(checkProbePath([a,b],a,b,()=>true)).toEqual({valid:true,reason:'valid',length:19});
  expect(checkProbePath([{...a,x:1.2},{...b,x:19.8}],a,b,()=>true)).toEqual({valid:true,reason:'valid',length:19});
  expect(checkProbePath([{...a,x:1.2},b],a,b,(p,q)=>!(p.x===1&&q.x===1.2)).valid).toBe(false);
 });
 it('routes around a wall through its opening and passes runtime square-body sweeps',()=>{
  const size=32,walkable=(i:number)=>i%size!==16||Math.floor(i/size)>=24;
  const probe=buildProbe(groundGeometry({size,walkable,height:()=>0}),.4,2);
  try{
   const a={x:4,y:0,z:4},b={x:27,y:0,z:4},result=queryProbe(probe.query,a,b);
   const checked=checkProbePath(result.path,a,b,(p,q)=>clearSweep(fixed({x:p.x,y:p.z}),fixed({x:q.x,y:q.z}),(_from,to)=>walkable(to),size,400));
   expect(result.success).toBe(true);expect(checked.valid).toBe(true);
   expect(result.path.some(p=>p.z>23)).toBe(true);
  }finally{disposeProbe(probe);}
 });
 it('does not count a disconnected destination as a complete route',()=>{
  const probe=buildProbe(groundGeometry({size:32,walkable:i=>i%32!==16,height:()=>0}),.4,2);
  try{
   const a={x:4,y:0,z:4},b={x:27,y:0,z:4},result=queryProbe(probe.query,a,b);
   expect(checkProbePath(result.path,a,b,()=>true).valid).toBe(false);
  }finally{disposeProbe(probe);}
 });
 it('returns the straight shortest route in open terrain consistently across rebuilds',()=>{
  const geometry=groundGeometry({size:32,walkable:()=>true,height:()=>0});
  const a={x:4,y:0,z:4},b={x:27,y:0,z:23};
  const routes=[];
  for(let i=0;i<2;i++){
   const probe=buildProbe(geometry,.4,2);
   try{
    const result=queryProbe(probe.query,a,b);
    expect(result.success).toBe(true);
    expect(checkProbePath(result.path,a,b,()=>true).length).toBeCloseTo(Math.hypot(23,19),5);
    routes.push(result.path);
   }finally{disposeProbe(probe);}
  }
  expect(routes[0]).toEqual(routes[1]);
 });
});
