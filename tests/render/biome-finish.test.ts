import {describe,it,expect,vi} from 'vitest';
import {OrthographicCamera,PerspectiveCamera,DepthTexture,WebGLRenderTarget,type WebGLRenderer} from 'three';
import {BeautyPass} from '../../src/render/atmosphere/beautyPass';
import {NEUTRAL_POST_PROCESSING} from '../../src/shared/environment/postProcessing';
import {BIOMES,biomeEnvironment} from '../../src/content/biomes';
import {createBiomeMap} from '../../src/shared/map/newMap';
import {parseUtcMap,stringifyUtcMap} from '../../src/shared/map/utcmap';

describe('biome finish',()=>{
 it('excludes the biome-owned post-processing profile from map snapshots for every biome',()=>{
  for(const b of BIOMES){
   const map=createBiomeMap('Look test',256,b.id);
   const legacy={...map,landscape:{...map.landscape!,environment:{...map.landscape!.environment,postProcessing:NEUTRAL_POST_PROCESSING}}};
   const parsed=parseUtcMap(JSON.parse(stringifyUtcMap(legacy)))!;
   expect(parsed.landscape!.environment).not.toHaveProperty('postProcessing');
   const look=biomeEnvironment(b.id,parsed.landscape!.environment).postProcessing!;
   expect(look).toBeDefined();
   // Mutating a resolved look never leaks back into the biome definition.
   const strength=biomeEnvironment(b.id).postProcessing!.bloom.strength;look.bloom.strength=strength+99;
   expect(biomeEnvironment(b.id).postProcessing!.bloom.strength).toBe(strength);
  }
 });
 it('skips a neutral look, restores capture destinations, supports both cameras and disposes its targets',()=>{
  const pass=new BeautyPass(),source=new WebGLRenderTarget(1400,875),destination=new WebGLRenderTarget(800,600);
  source.depthTexture=new DepthTexture(1400,875);
  let renders=0;
  const gl={getRenderTarget:()=>destination,setRenderTarget:vi.fn(),render:()=>{renders++;}} as unknown as WebGLRenderer;
  const camera=new PerspectiveCamera(45,1.6,.1,500);camera.updateMatrixWorld();
  pass.render(gl,source,camera,-1,NEUTRAL_POST_PROCESSING);expect(renders).toBe(0);
  const look=structuredClone(biomeEnvironment(BIOMES[0].id).postProcessing!);look.bloom.strength=.2;look.contact.strength=Math.max(look.contact.strength,.5);
  pass.render(gl,source,camera,-1,look);
  expect(renders).toBeGreaterThan(0);expect(gl.setRenderTarget).toHaveBeenLastCalledWith(destination);
  renders=0;pass.render(gl,source,new OrthographicCamera(-10,10,10,-10,.1,100),-1,look);
  expect(renders).toBeGreaterThan(0);expect(gl.setRenderTarget).toHaveBeenLastCalledWith(destination);
  const disposed=vi.fn();pass.contact.addEventListener('dispose',disposed);
  pass.dispose();expect(disposed).toHaveBeenCalledOnce();source.dispose();destination.dispose();
 });
 it('restores the previous render target even if a draw fails',()=>{
  const pass=new BeautyPass(),source=new WebGLRenderTarget(64,64),destination=new WebGLRenderTarget(16,16);
  const gl={getRenderTarget:()=>destination,setRenderTarget:vi.fn(),render:()=>{throw Error('draw failure');}} as unknown as WebGLRenderer;
  const look=structuredClone(biomeEnvironment(BIOMES[0].id).postProcessing!);look.bloom.strength=.2;look.contact.strength=Math.max(look.contact.strength,.5);
  expect(()=>pass.render(gl,source,new OrthographicCamera(),0,look)).toThrow('draw failure');
  expect(gl.setRenderTarget).toHaveBeenLastCalledWith(destination);
  pass.dispose();source.dispose();destination.dispose();
 });
});
