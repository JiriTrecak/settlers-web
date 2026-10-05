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
