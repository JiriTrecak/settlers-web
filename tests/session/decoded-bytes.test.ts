import {expect,it} from 'vitest';
import {decodeBytePatch,decodedByteCursor,decodedByteChanges} from '../../src/shared/snapshots/decodedBytes';

it('tracks in-place decoded updates across skipped frames, reversions and empty packets',()=>{
  const cells=decodeBytePatch({full:new Uint8Array(64)}),first=decodedByteCursor(cells);
  const changes=new Uint32Array([3*4+2,9*4+1]);
  expect(decodeBytePatch({changes},cells)).toBe(cells);
  const second=decodedByteCursor(cells);
  decodeBytePatch({changes:new Uint32Array([3*4])},cells);
  expect(cells[3]).toBe(0);expect(cells[9]).toBe(1);
  expect(decodedByteChanges(first,cells)).toEqual([changes,new Uint32Array([12])]);
  expect(decodedByteChanges(first,cells)![0]).toBe(changes);
  expect(decodedByteChanges(second,cells)).toEqual([new Uint32Array([12])]);
  const latest=decodedByteCursor(cells);
  decodeBytePatch({changes:new Uint32Array()},cells);
  expect(decodedByteCursor(cells)).toBe(latest);
  expect(decodedByteChanges(latest,cells)).toEqual([]);
});

it('requires a refresh after replacement, missing metadata or bounded-history overflow',()=>{
  const cells=decodeBytePatch({full:new Uint8Array(20000)}),first=decodedByteCursor(cells);
  for(let i=0;i<17;i++)decodeBytePatch({changes:new Uint32Array([i*4+1])},cells);
  expect(decodedByteChanges(first,cells)).toBeUndefined();
  const recent=decodedByteCursor(cells);
  decodeBytePatch({changes:new Uint32Array([100*4+2])},cells);
  expect(decodedByteChanges(recent,cells)).toEqual([new Uint32Array([402])]);
  const beforeLarge=decodedByteCursor(cells);
  decodeBytePatch({changes:Uint32Array.from({length:17000},(_,i)=>i*4+1)},cells);
  expect(decodedByteChanges(beforeLarge,cells)).toBeUndefined();
  expect(decodedByteChanges(decodedByteCursor(cells),decodeBytePatch({full:cells.slice()}))).toBeUndefined();
  expect(decodedByteChanges(first,new Uint8Array(20000))).toBeUndefined();
  expect(()=>decodeBytePatch({changes:new Uint32Array([1])})).toThrow('without baseline');
});
