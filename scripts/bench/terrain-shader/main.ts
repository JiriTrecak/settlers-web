import {AmbientLight,DirectionalLight,Scene,PerspectiveCamera,WebGLRenderer,PCFShadowMap,VSMShadowMap} from 'three';
import {HeightField} from '../../../src/shared/map/height';
import {HeightMesh} from '../../../src/render/height/heightMesh';
import {FogOfWar} from '../../../src/render/visibility/fogOfWar';
import {sourceReflection} from '../../../src/render/terrain/sourceReflection';

// Open through the normal dev server. Real driver compilation catches sampler
// exhaustion that source-string tests and TypeScript cannot detect.
const output=document.querySelector('#result')!;
const renderer=new WebGLRenderer({canvas:document.querySelector('canvas')!});
renderer.setSize(512,384,false);renderer.shadowMap.enabled=true;
const scene=new Scene(),camera=new PerspectiveCamera(55,4/3,.1,200);
camera.position.set(8,28,32);camera.lookAt(8,0,8);
const sun=new DirectionalLight(0xffffff,2);sun.position.set(5,30,10);sun.castShadow=true;scene.add(sun,new AmbientLight(0xffffff,1));
const reflection=sourceReflection();scene.environment=reflection.texture;
const field=new HeightField(16);field.samples.fill(1);field.grassCoverage=new Float32Array(field.samples.length).fill(.7);
field.rockCoverage=new Float32Array(field.samples.length).fill(.3);
const terrain=new HeightMesh(scene,16);terrain.setFrom(field);terrain.material.update(field,[]);
const fog=new FogOfWar(16),reports:string[]=[];
try{
 await Promise.all([terrain.material.ready,reflection.ready]);
 const gl=renderer.getContext();
 for(const mode of ['editor','game'] as const){
  if(mode==='game')fog.prepare(scene);
  for(const shadow of [PCFShadowMap,VSMShadowMap]){
   renderer.shadowMap.type=shadow;renderer.shadowMap.needsUpdate=true;terrain.material.needsUpdate=true;
   await renderer.compileAsync(scene,camera);renderer.render(scene,camera);
   for(const entry of renderer.info.programs??[]){
    if(!gl.getProgramParameter(entry.program,gl.LINK_STATUS))throw Error(`${mode}: ${gl.getProgramInfoLog(entry.program)}`);
   }
   reports.push(`PASS ${mode}, ${shadow===PCFShadowMap?'PCF':'VSM'} shadows: all GPU programs link`);
  }
 }
 reports.push(`GPU fragment texture limit: ${gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)}`);
 output.textContent=reports.join('\n');
}catch(error){output.textContent=`FAIL\n${reports.join('\n')}\n${error}`;throw error;}
