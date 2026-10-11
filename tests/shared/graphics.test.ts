import {describe,it,expect,vi,afterEach} from 'vitest';
import {readRenderResolution,renderDimensions,setRenderResolution,RESOLUTION_KEY,GRAPHICS_CHANGED,type RenderResolution,readShadowMode,setShadowMode,SHADOW_KEY,SHADOWS_CHANGED} from '../../src/shared/settings/graphics';
import {portraitViewport} from '../../src/render/portrait/viewport';
afterEach(()=>vi.unstubAllGlobals());
function storage(){
 const data=new Map<string,string>(),dispatchEvent=vi.fn();
 vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v)});
 vi.stubGlobal('window',{dispatchEvent});return {data,dispatchEvent};
}
describe('render resolution',()=>{
 it('renders Native at physical viewport resolution',()=>{
  expect(renderDimensions('native',1200,800,2)).toEqual({width:2400,height:1600});
  expect(renderDimensions('native',1000,600,1.25)).toEqual({width:1250,height:750});
 });
 it('keeps an explicit resolution through window and display changes',()=>{
  for(const [w,h,dpr] of [[1200,800,2],[800,600,1],[2000,900,3]]){
   expect(renderDimensions('1920x1080',w,h,dpr)).toEqual({width:1920,height:1080});
  }
 });
 it('persists the selection and announces it for live renderers',()=>{
  const {data,dispatchEvent}=storage();expect(readRenderResolution()).toBe('native');
  setRenderResolution('2560x1440');expect(readRenderResolution()).toBe('2560x1440');
  expect(data.get(RESOLUTION_KEY)).toBe('2560x1440');
  expect(dispatchEvent.mock.lastCall![0]).toMatchObject({type:GRAPHICS_CHANGED,detail:'2560x1440'});
  setRenderResolution('native');expect(readRenderResolution()).toBe('native');
 });
 it('ignores obsolete percentages and damaged preferences',()=>{
  const {data,dispatchEvent}=storage();data.set('utc.graphics.resolution-scale','0.5');
  expect(readRenderResolution()).toBe('native');
  data.set(RESOLUTION_KEY,'garbage');expect(readRenderResolution()).toBe('native');
  setRenderResolution('garbage' as RenderResolution);expect(dispatchEvent).not.toHaveBeenCalled();
 });
 it('handles unavailable storage and invalid viewport dimensions',()=>{
  vi.stubGlobal('localStorage',{getItem:()=>{throw new Error('unavailable');}});
  expect(readRenderResolution()).toBe('native');
  expect(renderDimensions('native',0,-1,NaN)).toEqual({width:1,height:1});
  expect(renderDimensions('native',NaN,Infinity,0)).toEqual({width:1,height:1});
 });
});
it('keeps the portrait in its DOM slot at fixed and native resolutions',()=>{
 const rect={left:110,bottom:580,width:100,height:80},canvas={left:10,bottom:600,width:1000,height:600};
 expect(portraitViewport(rect,canvas,1920,1080,1)).toEqual({x:192,y:36,width:192,height:144,pixelWidth:192,pixelHeight:144});
 expect(portraitViewport(rect,canvas,2000,1200,2)).toEqual({x:100,y:20,width:100,height:80,pixelWidth:200,pixelHeight:160});
});
it('persists shadows independently of resolution',()=>{
 const {data,dispatchEvent}=storage();expect(readShadowMode()).toBe('soft');setRenderResolution('1920x1080');
 for(const mode of ['filtered','off','soft'] as const){setShadowMode(mode);expect(readShadowMode()).toBe(mode);expect(readRenderResolution()).toBe('1920x1080');expect(dispatchEvent.mock.lastCall![0].type).toBe(SHADOWS_CHANGED);}
 data.set(SHADOW_KEY,'broken');expect(readShadowMode()).toBe('soft');
});
it('retains the soft shadow default when preferences cannot be read',()=>{
 vi.stubGlobal('localStorage',{getItem:()=>{throw new Error('storage unavailable');}});expect(readShadowMode()).toBe('soft');
});
