import {expect,it} from 'vitest';
import {MinimapSceneryIndex} from '../../src/render/minimap/sceneryIndex';
import {sceneryKind} from '../../src/render/minimap/terrainStyle';
import type {MapStamp} from '../../src/shared/map/utcmap';

const stamps:MapStamp[]=[
 {id:'far',asset:'pine',x:1,y:5},{id:'ignored',asset:'grass',x:4,y:1},
 {id:'rock',asset:'boulder',x:3,y:2},{id:'tie',asset:'oak',x:2,y:2,scale:2,widthScale:.8},
];
it('matches the original ordered scenery list and reuses it for irrelevant edits',()=>{
 const index=new MinimapSceneryIndex();expect(index.update(stamps)).toBe(true);
 expect(index.items).toEqual(stamps.filter(s=>sceneryKind(s.asset)).slice().sort((a,b)=>a.y-b.y).map(stamp=>({stamp,kind:sceneryKind(stamp.asset)})));
 const before=index.items;
 expect(index.update(stamps.map(s=>({...s,yaw:2,elevation:4})))).toBe(false);expect(index.items).toBe(before);
 expect(index.update([...stamps,{id:'other',asset:'fern',x:8,y:8}])).toBe(false);expect(index.items).toBe(before);
});
it('invalidates moves, appearances, removals, kind changes and the source order of overlapping ties',()=>{
 const index=new MinimapSceneryIndex();index.update(stamps);
 const cases:MapStamp[][]=[
  stamps.map(s=>s.id==='far'?{...s,y:0}:s),
  stamps.map(s=>s.id==='rock'?{...s,x:8}:s),
  stamps.map(s=>s.id==='tie'?{...s,scale:3,widthScale:2,variant:'gold'}:s),
  stamps.filter(s=>s.id!=='rock'),
  stamps.map(s=>s.id==='ignored'?{...s,asset:'fir'}:s),
  [stamps[0],stamps[1],stamps[3],stamps[2]],
  [],stamps,
 ];
 for(const next of cases){expect(index.update(next)).toBe(true);expect(index.items).toEqual(next.filter(s=>sceneryKind(s.asset)).slice().sort((a,b)=>a.y-b.y).map(stamp=>({stamp,kind:sceneryKind(stamp.asset)})));}
});
it('detects in-place stamp changes submitted in a new array without mutating the previous index',()=>{
 const index=new MinimapSceneryIndex(),stamp={...stamps[0]};index.update([stamp]);
 const previous=index.items;stamp.x+=3;
 expect(index.update([stamp])).toBe(true);expect(index.items[0].stamp.x).toBe(stamp.x);
 expect(previous[0].stamp.x).toBe(stamp.x-3);
});

it('retains the raster order when an edit appends a different-Y stamp to the document',()=>{
 const index=new MinimapSceneryIndex();index.update(stamps);const original=index.items;
 expect(index.update([...stamps.slice(1),{...stamps[0],yaw:1}])).toBe(false);
 expect(index.items).toBe(original);
 expect(index.update(stamps)).toBe(false);expect(index.items).toBe(original);
 // Source order still matters for the equal-Y rock/oak pair.
 expect(index.update([stamps[0],stamps[1],stamps[3],stamps[2]])).toBe(true);
});
