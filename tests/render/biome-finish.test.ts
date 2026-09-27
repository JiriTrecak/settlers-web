import {describe,it,expect,vi} from 'vitest';
import {OrthographicCamera,PerspectiveCamera,DepthTexture,WebGLRenderTarget,type WebGLRenderer} from 'three';
import {BeautyPass} from '../../src/render/atmosphere/beautyPass';
import {beautyBufferSize,NEUTRAL_POST_PROCESSING} from '../../src/shared/environment/postProcessing';
import {BIOMES,biomeEnvironment} from '../../src/content/biomes';
import {createBiomeMap} from '../../src/shared/map/newMap';
import {parseUtcMap,stringifyUtcMap} from '../../src/shared/map/utcmap';

describe('biome finish',()=>{
 it('owns a distinct profile per biome and excludes it from map snapshots',()=>{
  const looks=BIOMES.map(b=>biomeEnvironment(b.id).postProcessing!);
  expect(new Set(looks.map(l=>JSON.stringify(l))).size).toBe(BIOMES.length);
  for(const b of BIOMES){
   const map=createBiomeMap('Look test',256,b.id);
   const legacy={...map,landscape:{...map.landscape!,environment:{...map.landscape!.environment,postProcessing:NEUTRAL_POST_PROCESSING}}};
   const parsed=parseUtcMap(JSON.parse(stringifyUtcMap(legacy)))!;
   expect(parsed.landscape!.environment).not.toHaveProperty('postProcessing');
   const look=biomeEnvironment(b.id,parsed.landscape!.environment).postProcessing!;
   expect(look.bloom.strength).toBeGreaterThan(0);
   expect(look.contact.strength).toBeGreaterThan(0);
   look.bloom.strength=99;
   expect(biomeEnvironment(b.id).postProcessing!.bloom.strength).toBeLessThan(1);
  }
 });
 it('bounds contact shading and the whole bloom pyramid at 8K',()=>{
  for(const [w,h] of [[1,1],[1400,875],[7680,4320],[4096,8192]]){
   const size=beautyBufferSize(w,h);
   expect(size.width*size.height).toBeLessThanOrEqual(180_000);
   const pyramid=[0,1,2].reduce((sum,i)=>sum+Math.max(1,size.width>>i)*Math.max(1,size.height>>i),0);
   expect(pyramid).toBeLessThanOrEqual(236_250);
  }
 });
 it('reuses targets, skips disabled passes, restores capture destinations, supports both cameras',()=>{
  const pass=new BeautyPass(),source=new WebGLRenderTarget(1400,875),destination=new WebGLRenderTarget(800,600);
  source.depthTexture=new DepthTexture(1400,875);
  const renders:any[]=[];
  const gl={getRenderTarget:()=>destination,setRenderTarget:vi.fn(),render:(scene:any)=>{const m=scene.children[0].material;renders.push({uniforms:Object.fromEntries(Object.entries(m.uniforms).map(([k,v]:[string,any])=>[k,v.value])),material:m});}} as unknown as WebGLRenderer;
  const camera=new PerspectiveCamera(45,1.6,.1,500);camera.updateMatrixWorld();
  pass.render(gl,source,camera,-1,NEUTRAL_POST_PROCESSING);expect(renders).toHaveLength(0);
  const look=biomeEnvironment('vibrant-forest').postProcessing!;
  pass.render(gl,source,camera,-1,look);
  expect(renders).toHaveLength(4);expect(renders[0].uniforms.perspectiveCamera).toBe(true);
  expect(renders[1].uniforms.prefilter).toBe(true);expect(renders[2].uniforms.prefilter).toBe(false);
  expect(renders[3].uniforms.source).toBe(pass.bloom[1].texture);
  expect(gl.setRenderTarget).toHaveBeenLastCalledWith(destination);
  const resize=vi.spyOn(pass.contact,'setSize');renders.length=0;
  pass.render(gl,source,new OrthographicCamera(-10,10,10,-10,.1,100),-1,look);
  expect(resize).not.toHaveBeenCalled();expect(renders[0].uniforms.perspectiveCamera).toBe(false);
  const disposed=vi.fn();pass.contact.addEventListener('dispose',disposed);
  pass.dispose();expect(disposed).toHaveBeenCalledOnce();source.dispose();destination.dispose();
 });
 it('restores the previous render target even if a draw fails',()=>{
  const pass=new BeautyPass(),source=new WebGLRenderTarget(64,64),destination=new WebGLRenderTarget(16,16);
  const gl={getRenderTarget:()=>destination,setRenderTarget:vi.fn(),render:()=>{throw Error('draw failure');}} as unknown as WebGLRenderer;
  expect(()=>pass.render(gl,source,new OrthographicCamera(),0,biomeEnvironment('vibrant-forest').postProcessing!)).toThrow('draw failure');
  expect(gl.setRenderTarget).toHaveBeenLastCalledWith(destination);
  pass.dispose();source.dispose();destination.dispose();
 });
});
