import {expect,it,vi,afterEach} from 'vitest';
import {AtmospherePass,atmosphereQualitySpec} from '../../src/render/atmosphere/atmospherePass';
import {DEFAULT_ATMOSPHERE} from '../../src/shared/landscape/atmosphere';
import {Scene,OrthographicCamera,PerspectiveCamera,DirectionalLight,Vector2,Mesh,ShaderMaterial,type WebGLRenderer} from 'three';
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

it('applies the biome lens only to perspective views and respects the off preference',()=>{
 const pass=new AtmospherePass();let radius=-1;
 const gl={autoClear:true,toneMappingExposure:1,shadowMap:{autoUpdate:true},
  getRenderTarget:()=>null,setRenderTarget:vi.fn(),getDrawingBufferSize:(v:Vector2)=>v.set(1920,1080),
  render:(s:Scene)=>{const m=(s.children[0] as Mesh<never,ShaderMaterial>)?.material;if(m?.uniforms?.dofRadius)radius=m.uniforms.dofRadius.value;},
 } as unknown as WebGLRenderer;
 const scene=new Scene(),frame={depthOfField:{start:60,end:260,radius:9,strength:1},sun:new DirectionalLight(),waterLevel:0,mapSize:256,time:0,windX:0,windZ:0,rain:0};
 pass.render(gl,scene,new PerspectiveCamera(),frame);expect(radius).toBe(9);
 pass.render(gl,scene,new OrthographicCamera(),frame);expect(radius).toBe(0);
 pass.render(gl,scene,new PerspectiveCamera(),{...frame,depthOfField:{...frame.depthOfField,strength:0}});expect(radius).toBe(0);
 vi.stubGlobal('localStorage',{getItem:()=> 'off'});
 pass.render(gl,scene,new PerspectiveCamera(),frame);expect(radius).toBe(0);
 pass.dispose();
});
