import {expect,it,vi} from 'vitest';
import {Minimap} from '../../src/render/minimap/minimap';
import type {SettlementView} from '../../src/sim/game/observation';
import {decodeBytePatch} from '../../src/shared/snapshots/decodedBytes';

// A browser canvas is unavailable in node, so the minimap's fog canvas is a recording stub and the fog
// pixel buffer is read back through the ImageData it allocated.
it('keeps minimap fog pixels equal to the latest fog state through wire patches, reverts, owner changes and stalls',()=>{
 const createImageData=vi.fn((width:number,height:number)=>({width,height,data:new Uint8ClampedArray(width*height*4)}));
 const ctx={createImageData,putImageData:vi.fn()},canvas={width:0,height:0,getContext:()=>ctx};
 const mini=Object.create(Minimap.prototype) as Minimap;
 Object.assign(mini,{fogState:null,fogRevision:-1,fogCanvas:canvas,dirty:false});
 let revision=0;
 const show=(cells?:Uint8Array,owner=0,fogRevision=revision)=>mini.setFog({revision:revision++,fog:cells?{cells,owner,revision:fogRevision}:undefined} as SettlementView);
 const alpha=()=>{const data=createImageData.mock.results.at(-1)!.value.data;return Array.from({length:data.length/4},(_,i)=>data[i*4+3]);};
 // Unseen = opaque (255), explored = 166, visible = clear (0).
 const expected=(cells:Uint8Array)=>Array.from(cells,c=>c===2?0:c===1?166:255);
 const cells=decodeBytePatch({full:new Uint8Array(64)});show(cells);expect(alpha()).toEqual(expected(cells));
 decodeBytePatch({changes:new Uint32Array()},cells);show(cells);expect(alpha()).toEqual(expected(cells));
 // Two patches arrive before a paint; a cell that changed and reverted ends up unchanged.
 decodeBytePatch({changes:new Uint32Array([9*4+2,50*4+1])},cells);
 decodeBytePatch({changes:new Uint32Array([50*4])},cells);show(cells);
 expect(alpha()).toEqual(expected(cells));expect(alpha()[9]).toBe(0);expect(alpha()[50]).toBe(255);
 // Owner/load replacement can reuse a revision; it must still refresh.
 const explored=decodeBytePatch({full:new Uint8Array(64).fill(1)});show(explored,0,revision-1);expect(alpha()).toEqual(expected(explored));
 show();show(cells);expect(alpha()).toEqual(expected(cells));
 // A stalled consumer falls back safely, as do untracked direct views.
 for(let i=0;i<17;i++)decodeBytePatch({changes:new Uint32Array([i*4+1])},cells);
 show(cells);expect(alpha()).toEqual(expected(cells));
 const visible=new Uint8Array(64).fill(2);show(visible,1);expect(alpha()).toEqual(expected(visible));
 // A different map size resizes the fog canvas.
 show(decodeBytePatch({full:new Uint8Array(256)}));expect(canvas.width).toBe(16);expect(canvas.height).toBe(16);expect(alpha()).toEqual(Array(256).fill(255));
});
