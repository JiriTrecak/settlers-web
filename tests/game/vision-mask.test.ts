import {expect,it,vi} from 'vitest';
import {TacticalTerrain} from '../../src/shared/map/tacticalTerrain';
import {VisionMask,type VisionSource} from '../../src/sim/game/visionMask';

it('retains overlapping sight, explores lost cells and never mutates published fog',()=>{
  const mask=new VisionMask(new Uint8Array(16));
  const footprint=vi.fn((s:VisionSource)=>[s.x,s.x+1,s.x+2]);
  const a={id:1,x:2,y:0,radius:1},b={id:2,x:3,y:0,radius:1};
  mask.update([a,b],footprint);const before=mask.cells;
  expect(mask.update([a,b],footprint)).toBe(false);expect(footprint).toHaveBeenCalledTimes(2);
  mask.update([b],footprint);expect(mask.cells[2]).toBe(1);expect(mask.cells[3]).toBe(2);expect(before[2]).toBe(2);
  mask.update([{...b,x:8}],footprint);expect([...mask.visible]).toEqual([8,9,10]);expect(mask.cells[3]).toBe(1);
});

it('rebuilds coverage after restore and matches a full recompute through movement, removal and radius changes',()=>{
  const restored=new Uint8Array(64);restored[60]=2;restored[61]=1;
  const mask=new VisionMask(restored);let expected=restored.slice();
  const footprint=(s:VisionSource)=>Array.from({length:s.radius+1},(_,i)=>s.x+i).filter(i=>i<64);
  for(let tick=0;tick<80;tick++){
    const sources=Array.from({length:tick%9},(_,i)=>({id:i,x:(i*3+tick)%50,y:0,radius:tick%4}));
    expected=expected.map(v=>v===2?1:v);
    for(const source of sources)for(const cell of footprint(source))expected[cell]=2;
    mask.update(sources,footprint);expect(mask.cells).toEqual(expected);
    expect([...mask.visible].sort((a,b)=>a-b)).toEqual([...expected.keys()].filter(i=>expected[i]===2));
  }
});


it('merges compressed and dense footprints exactly through overlap, holes, jumps, removal and restore',()=>{
 const size=33,heights=Int16Array.from({length:size*size},(_,i)=>i%size>15&&i%size<20?380:0);
 const terrain=new TacticalTerrain(size,heights),initial=new Uint8Array(size*size);initial[10]=2;initial[11]=1;
 let mask=new VisionMask(initial),expected=initial.slice();
 for(let tick=0;tick<160;tick++){
  const sources=Array.from({length:tick%13},(_,i)=>({id:i,x:(i*7+tick)%size,y:(i*13+tick)%size,radius:[0,.5,3,7.3,18][(i+tick)%5]!,elevation:tick%7===0?5:0}));
  expected=expected.map(v=>v===2?1:v);
  for(const source of sources)for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   if((x-source.x)**2+(y-source.y)**2<=source.radius**2&&terrain.visible(source,{x,y}))expected[y*size+x]=2;
  }
  const prior=mask.cells,saved=prior.slice();
  mask.update(sources,s=>s.id%2?terrain.visibleSpans(s,s.radius):terrain.visibleCells(s,s.radius));
  expect(prior).toEqual(saved);expect(mask.cells,`tick ${tick}`).toEqual(expected);
  expect([...mask.visible].sort((a,b)=>a-b)).toEqual([...expected.keys()].filter(i=>expected[i]===2));
  if(tick%17===0)mask=new VisionMask(mask.cells.slice());
 }
 mask.update([],()=>[]);expect([...mask.visible]).toEqual([]);
});

it('attributes reuse, change causes, footprint work and full-buffer copies exactly',async()=>{
 const {SimulationProfiler}=await import('../../src/sim/profiling');
 const p=new SimulationProfiler();p.enabled=true;
 const mask=new VisionMask(new Uint8Array(16),p),footprint=(s:VisionSource)=>[s.x,s.x+1,s.x+2];
 const a={id:1,x:2,y:0,radius:1};
 mask.update([a],footprint);
 const count=(suffix:string)=>p.workSnapshot().filter(x=>x.path.endsWith(suffix)).reduce((n,x)=>n+x.value,0);
 expect(count('Sensors added')).toBe(1);expect(count('Bytes copied')).toBe(16);expect(count('Changed fog cells')).toBe(3);
 p.reset();mask.update([a],footprint);
 expect(count('Sensors unchanged')).toBe(1);expect(count('Bytes copied')).toBe(0);
 p.reset();mask.update([{...a,x:3}],footprint);
 expect(count('Changed position')).toBe(1);expect(count('Coverage cells added')).toBe(1);expect(count('Coverage cells removed')).toBe(1);
 expect(count('Touched cells')).toBe(2);expect(count('Changed fog cells')).toBe(2);expect(count('Bytes copied')).toBe(16);
 p.reset();mask.update([],footprint);expect(count('Sensors removed')).toBe(1);expect(count('Coverage cells removed')).toBe(3);
});

it('terrain work diagnostics preserve sight and identify cold versus cached footprints',async()=>{
 const {SimulationProfiler}=await import('../../src/sim/profiling');
 const p=new SimulationProfiler();p.enabled=true;
 const size=32,heights=Int16Array.from({length:size*size},(_,i)=>i%size===16?380:0);
 const measured=new TacticalTerrain(size,heights),plain=new TacticalTerrain(size,heights);measured.diagnostics=p;
 const origin={x:13,y:16};expect(measured.visibleSpans(origin,8)).toEqual(plain.visibleSpans(origin,8));
 expect(p.workSnapshot().find(x=>x.path==='Footprint cache misses')?.value).toBe(1);
 expect(p.workSnapshot().find(x=>x.path==='Terrain rays')!.value).toBeGreaterThan(0);
 p.reset();measured.visibleSpans(origin,8);
 expect(p.workSnapshot().find(x=>x.path==='Footprint cache hits')?.value).toBe(1);
 expect(p.workSnapshot().find(x=>x.path==='Terrain rays')?.value).toBe(0);
});
