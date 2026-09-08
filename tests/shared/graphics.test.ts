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
