import {expect,it} from 'vitest';
import {MinimapSceneryIndex} from '../../src/render/minimap/sceneryIndex';
import {sceneryKind} from '../../src/render/minimap/terrainStyle';
import {SceneryComposition} from '../../src/presentation/sceneryChanges';
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

it('merges immutable scenery parts without revisiting static records on resource changes',()=>{
 let staticReads=0;
 const base:MapStamp[]=Array.from({length:1000},(_,i)=>({id:`base-${i}`,get asset(){staticReads++;return 'pine';},x:i,y:i%5}));
 const resource=(id:string,y:number):MapStamp=>({id,asset:'oak',x:3,y});
 const a=resource('a',2),b=resource('b',2),c=resource('c',0);
 const composition=new SceneryComposition(),index=new MinimapSceneryIndex();
 index.update(composition.compose(base,[a,b]));staticReads=0;
 for(const dynamic of [[a,b,c],[b,c],[c,b],[a,c,b],[],[a]]){
  const next=composition.compose(base,dynamic);index.update(next);
  expect(staticReads).toBe(0);
  // Match a full fresh index, including ties between static and dynamic parts.
  const fresh=new MinimapSceneryIndex();fresh.update([...base,...dynamic]);
  expect(index.items).toEqual(fresh.items);staticReads=0;
 }
 // Consumers may skip publications: immutable parts still avoid rescanning.
 composition.compose(base,[b]);index.update(composition.compose(base,[a,b]));
 expect(staticReads).toBe(0);
 const fresh=new MinimapSceneryIndex();fresh.update([...base,a,b]);expect(index.items).toEqual(fresh.items);
});

it('handles switching between composition and mutable authoring lists, and replacing the base',()=>{
 const index=new MinimapSceneryIndex(),composition=new SceneryComposition();
 const base=stamps.slice(0,2),dynamic=stamps.slice(2);
 const check=(next:readonly MapStamp[])=>{
  index.update(next);const fresh=new MinimapSceneryIndex();fresh.update([...next]);expect(index.items).toEqual(fresh.items);
 };
 check(stamps);check(composition.compose(base,dynamic));
 check(stamps.map(s=>({...s,x:s.x+10})));check(composition.compose(base,[]));
 check([]);check(composition.compose(base,dynamic));
 check(composition.compose(base.map(s=>({...s,y:1})),dynamic));
 check(stamps);check([]);
});
