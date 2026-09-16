import {expect,it,vi,afterEach} from 'vitest';
import {AtmospherePass,atmosphereQualitySpec} from '../../src/render/atmosphere/atmospherePass';
import {DEFAULT_ATMOSPHERE} from '../../src/shared/landscape/atmosphere';
import {Scene,OrthographicCamera,DirectionalLight,type WebGLRenderer} from 'three';
afterEach(()=>vi.unstubAllGlobals());
it('keeps the expensive pixel budget bounded at Retina and large window sizes',()=>{
 for(const q of ['low','medium','high'] as const){const spec=atmosphereQualitySpec(q);const scale=Math.min(spec.scale,Math.sqrt(spec.maxPixels/(7680*4320)));expect(Math.floor(7680*scale)*Math.floor(4320*scale)).toBeLessThanOrEqual(spec.maxPixels);expect(spec.steps).toBeLessThanOrEqual(40);}
});
it('bypasses render targets and extra draws when the effect or player preference is off',()=>{
 const pass=new AtmospherePass(),render=vi.fn(),gl={render} as unknown as WebGLRenderer,scene=new Scene(),camera=new OrthographicCamera();
 const frame={settings:DEFAULT_ATMOSPHERE,sun:new DirectionalLight(),waterLevel:0,mapSize:256,time:0,windX:0,windZ:0,rain:0};
 pass.render(gl,scene,camera,frame);expect(render).toHaveBeenCalledExactlyOnceWith(scene,camera);
 vi.stubGlobal('localStorage',{getItem:()=> 'off'});render.mockClear();pass.render(gl,scene,camera,{...frame,settings:{...DEFAULT_ATMOSPHERE,enabled:true}});expect(render).toHaveBeenCalledExactlyOnceWith(scene,camera);pass.dispose();
});
