import {expect,it} from 'vitest';
import {MinimapSceneryIndex} from '../../src/render/minimap/sceneryIndex';
import {MinimapSceneryTiles} from '../../src/render/minimap/sceneryTiles';

it('invalidates only nearby tiles on harvest, preserving overlapping painter order',()=>{
 const index=new MinimapSceneryIndex(),tiles=new MinimapSceneryTiles();
 const stamps=Array.from({length:400},(_,i)=>({id:`tree${i}`,asset:'pine',x:(i%20)*24,y:Math.floor(i/20)*24,scale:2}));
 index.update(stamps);expect(tiles.update(index.items,512,384)).toHaveLength(144);
 const prior=index.items.slice();index.update(stamps.filter(s=>s.id!=='tree21'));
 expect(index.items.every(item=>prior.includes(item))).toBe(true);
 const changed=tiles.update(index.items,512,384);expect(changed.length).toBeGreaterThan(0);expect(changed.length).toBeLessThan(5);
 expect(changed.every(tile=>tile.x<=32&&tile.y<=32)).toBe(true);
 for(const tile of changed)expect(tile.items.every((item,i)=>i===0||item.stamp.y>=tile.items[i-1].stamp.y)).toBe(true);
 expect(tiles.update(index.items,512,384)).toEqual([]);
 expect(tiles.update(index.items,512,384,true)).toHaveLength(144);
 expect(tiles.update(index.items,256,384)).toHaveLength(144);
});

it('clears the old footprint on movement/removal and retains equal-Y layering changes',()=>{
 const index=new MinimapSceneryIndex(),tiles=new MinimapSceneryTiles();
 const a={id:'a',asset:'pine',x:31,y:31,scale:5},b={id:'b',asset:'rock',x:31,y:31};
 index.update([a,b]);tiles.update(index.items,384,384);
 expect(index.update([b,a])).toBe(true);
 const reversed=tiles.update(index.items,384,384);expect(reversed.length).toBe(4);
 for(const tile of reversed)expect(tile.items.map(i=>i.stamp.id)).toEqual(['b','a']);
 index.update([{...a,x:300,y:300},b]);
 const moved=tiles.update(index.items,384,384);
 expect(moved.some(tile=>tile.x>=288)).toBe(true);expect(moved.some(tile=>tile.x===0)).toBe(true);
 index.update([]);const removed=tiles.update(index.items,384,384);
 expect(removed.every(tile=>tile.items.length===0)).toBe(true);
});
