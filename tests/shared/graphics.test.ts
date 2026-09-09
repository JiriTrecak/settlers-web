import {describe,it,expect,vi,afterEach} from 'vitest';
import {readResolutionScale,renderPixelRatio,setResolutionScale} from '../../src/shared/settings/graphics';
afterEach(()=>vi.unstubAllGlobals());
describe('render resolution',()=>{
 it('uses physical native pixels and halves each axis',()=>{expect(renderPixelRatio(1,2)).toBe(2);expect(renderPixelRatio(.5,2)).toBe(1);expect(renderPixelRatio(.75,2)).toBe(1.5);expect(renderPixelRatio(1,3)).toBe(3);});
 it('persists the scale and rejects damaged preferences',()=>{
  const data=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v)});vi.stubGlobal('window',{dispatchEvent:vi.fn()});
  expect(readResolutionScale()).toBe(1);setResolutionScale(.5);expect(readResolutionScale()).toBe(.5);
  data.set('utc.graphics.resolution-scale','garbage');expect(readResolutionScale()).toBe(1);
 });
});

import {readShadowMode,setShadowMode,SHADOW_KEY,SHADOWS_CHANGED} from '../../src/shared/settings/graphics';
it('persists shadow selection independently of resolution and announces changes',()=>{
 const data=new Map<string,string>();const dispatchEvent=vi.fn();
 vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v)});vi.stubGlobal('window',{dispatchEvent});
 expect(readShadowMode()).toBe('soft');setResolutionScale(.5);
 for(const mode of ['filtered','off','soft'] as const){setShadowMode(mode);expect(readShadowMode()).toBe(mode);expect(readResolutionScale()).toBe(.5);expect(dispatchEvent.mock.lastCall![0].type).toBe(SHADOWS_CHANGED);}
 data.set(SHADOW_KEY,'broken');expect(readShadowMode()).toBe('soft');
});
it('retains the existing soft look if preferences cannot be read',()=>{
 vi.stubGlobal('localStorage',{getItem:()=>{throw new Error('storage unavailable');}});expect(readShadowMode()).toBe('soft');
});
