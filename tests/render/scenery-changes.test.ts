import {expect,it,vi} from 'vitest';
import {SceneryComposition,SceneryFilter,sceneryChanges} from '../../src/presentation/sceneryChanges';
import {MinimapSceneryIndex} from '../../src/render/minimap/sceneryIndex';
import type {MapStamp} from '../../src/shared/map/utcmap';
const stamp=(id:string,asset='pine',y=2):MapStamp=>({id,asset,x:1,y});

it('publishes only resource differences and rejects skipped generations and new bases',()=>{
 const compose=new SceneryComposition(),base=[stamp('base')],a=stamp('a'),b=stamp('b');
 const first=compose.compose(base,[a,b]),second=compose.compose(base,[b]);
 expect(sceneryChanges(first,second)).toEqual({removed:[a],added:[],reordered:false});
 const third=compose.compose(base,[]);
 expect(sceneryChanges(first,third)).toBeUndefined();
 expect(sceneryChanges(second,third)?.removed).toEqual([b]);
 const replacement=compose.compose([stamp('replacement')],[]);
 expect(sceneryChanges(third,replacement)).toBeUndefined();
 expect(first).toEqual([...base,a,b]);
});
it('retains source ordering and treats updated records as replacements',()=>{
 const compose=new SceneryComposition(),base:MapStamp[]=[],a=stamp('a'),b=stamp('b');
 const first=compose.compose(base,[a,b]),second=compose.compose(base,[b,a]);
 expect(sceneryChanges(first,second)?.reordered).toBe(true);
 const moved={...a,y:5},third=compose.compose(base,[b,moved]);
 expect(sceneryChanges(second,third)).toEqual({removed:[a],added:[moved],reordered:false});
});
it('filters only changes on harvest and forwards a verifiable removal publication',()=>{
 const compose=new SceneryComposition(),base=Array.from({length:10000},(_,i)=>stamp('base'+i,'grass')),a=stamp('a'),b=stamp('b');
 const accepts=vi.fn((s:MapStamp)=>s.asset==='pine'),filter=new SceneryFilter(accepts);
 const first=filter.select(compose.compose(base,[a,b]));accepts.mockClear();
 const second=filter.select(compose.compose(base,[b]));
 expect(second).toEqual([b]);expect(accepts).toHaveBeenCalledTimes(1);
 expect(sceneryChanges(first,second)).toEqual({removed:[a],added:[],reordered:false});
 // A regular editor array has no immutable publication contract.
 const mutable={...stamp('mutable')};filter.select([mutable]);mutable.asset='grass';
 expect(filter.select([mutable])).toEqual([]);
});
it('matches full minimap rebuilding through removals, additions, reorders, replacements and skipped frames',()=>{
 const compose=new SceneryComposition(),base=[stamp('base','oak')],a=stamp('a'),b=stamp('b','rock'),c=stamp('ignored','grass');
 const incremental=new MinimapSceneryIndex();
 for(const dynamic of [[a,b,c],[b,c],[c],[a,b,c],[b,a,c],[{...b,x:8},a],[],[a]]){
  const all=compose.compose(base,dynamic),full=new MinimapSceneryIndex();
  incremental.update(all);full.update([...all]);expect(incremental.items).toEqual(full.items);
 }
 compose.compose(base,[b]);const skipped=compose.compose(base,[b,c]);
 incremental.update(skipped);const full=new MinimapSceneryIndex();full.update([...skipped]);expect(incremental.items).toEqual(full.items);
});
