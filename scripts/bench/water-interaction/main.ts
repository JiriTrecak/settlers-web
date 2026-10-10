import {AmbientLight,Color,DepthTexture,DirectionalLight,HalfFloatType,InstancedMesh,Matrix4,Mesh,MeshBasicMaterial,OrthographicCamera,PerspectiveCamera,PlaneGeometry,Scene,SphereGeometry,UnsignedIntType,WebGLRenderer,WebGLRenderTarget,ShaderMaterial} from 'three';
import {HeightField} from '../../../src/shared/map/height';
import {HeightMesh} from '../../../src/render/height/heightMesh';
import {ImportedWater} from '../../../src/render/water/importedWater';
import {WaterInteraction} from '../../../src/render/water/waterInteraction';
import {WATER_DISTURBANCES as C} from '../../../src/render/water/waterDisturbances';
import type {EntityView} from '../../../src/sim/game/observation';
const output=document.querySelector('#result')!,renderer=new WebGLRenderer({canvas:document.querySelector('canvas')!,antialias:false});renderer.setSize(960,640,false);renderer.info.autoReset=false;renderer.shadowMap.enabled=true;
const scene=new Scene();scene.background=new Color('#102832');scene.add(new AmbientLight(0xffffff,.8));
const sun=new DirectionalLight(0xffefdb,2);sun.castShadow=true;sun.shadow.mapSize.set(256,256);sun.position.set(15,40,5);scene.add(sun);
const field=new HeightField(96);field.samples.fill(-.3);
for(let z=0;z<field.verts;z++)for(let x=0;x<field.verts;x++)field.samples[z*field.verts+x]=Math.max(-.3,(x+field.origin-66)*.15);
const terrain=new HeightMesh(scene,96);terrain.setFrom(field);terrain.material.update(field,[]);
const water=new ImportedWater(scene,field),probe=new WaterInteraction();
const camera=new PerspectiveCamera(50,1.5,.1,250);camera.position.set(43,38,73);camera.lookAt(43,0,36);camera.updateMatrixWorld();
const target=new WebGLRenderTarget(960,640,{type:HalfFloatType,depthBuffer:true});target.depthTexture=new DepthTexture(960,640,UnsignedIntType);
const screen=new Scene(),screenCamera=new OrthographicCamera(-1,1,1,-1,0,1);screen.add(new Mesh(new PlaneGeometry(2,2),new MeshBasicMaterial({map:target.texture,depthTest:false,depthWrite:false})));
const debug=new URLSearchParams(location.search).has('debug');
if(debug)(screen.children[0] as Mesh).material=new ShaderMaterial({uniforms:{image:{value:probe.target.texture}},vertexShader:'varying vec2 v;void main(){v=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:'uniform sampler2D image;varying vec2 v;void main(){vec4 d=texture2D(image,v);gl_FragColor=vec4(.5+d.rg*4.,d.a,1.);}'});
const count=Number(new URLSearchParams(location.search).get('units'))||256;
if(count<=32){camera.position.set(32,13,38);camera.lookAt(32,0,26);camera.updateMatrixWorld();}
const units=Array.from({length:count},(_,id)=>({id:id+1,definition:'fixture',owner:'red',x:0,y:0,rotation:0,hp:100,unit:{moving:true,contained:false,cargo:null,target:null,cooldown:0}} as unknown as EntityView));
const bodies=new InstancedMesh(new SphereGeometry(.3,6,4),new MeshBasicMaterial({color:'#b95c35'}),count);scene.add(bodies);const matrix=new Matrix4();
await Promise.all([terrain.material.ready,water.ready]);water.setActors(units,field);
const gl=renderer.getContext() as WebGL2RenderingContext,ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
const pending:WebGLQuery[]=[],gpu:number[]=[],cpu:number[]=[];let frame=0,start=performance.now();
function draw(now:number){
 renderer.info.reset();const t=(now-start)/1000;
 for(let i=0;i<count;i++){const e=units[i]!;e.x=22+(i%(count>32?32:16))*1.35+Math.sin(t*.11+i*.1)*.25;e.y=16+Math.floor(i/(count>32?32:16))*1.5+(t*2.4)%(count<=32?10:20);matrix.makeTranslation(e.x,-.05,e.y);bodies.setMatrixAt(i,matrix);}bodies.instanceMatrix.needsUpdate=true;
 water.tick(t*1000,43,36);renderer.setRenderTarget(target);renderer.render(scene,camera);const beforeWater=renderer.info.render.calls;water.render(renderer,target,camera,sun);const waterCalls=renderer.info.render.calls-beforeWater;renderer.setRenderTarget(null);renderer.render(screen,screenCamera);
 // Measure the complete emitter + upload CPU cost, and only the ripple pass GPU
 // cost separately. This extra target is a benchmark, not a production pass.
 const before=performance.now();probe.events.update(units,field,t,43,36);
 let query:WebGLQuery|null=null;if(ext&&frame>60&&frame<240){query=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,query!);}
 probe.render(renderer,t,43,36);cpu.push(performance.now()-before);
 if(query){gl.endQuery(ext!.TIME_ELAPSED_EXT);pending.push(query);}
 while(pending.length&&gl.getQueryParameter(pending[0]!,gl.QUERY_RESULT_AVAILABLE)){
  const q=pending.shift()!;if(!gl.getParameter(ext!.GPU_DISJOINT_EXT))gpu.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);
 }
 if(frame%60===0){
  const times=cpu.slice(-180).sort((a,b)=>a-b),gt=gpu.slice().sort((a,b)=>a-b),failures=(renderer.info.programs??[]).filter(p=>!gl.getProgramParameter(p.program,gl.LINK_STATUS));
  const error=gl.getError();output.textContent=`${failures.length||error?'FAIL':'PASS'} shaders / GL ${error} · ${count} moving units · water meshes ${water.group.children.length}, calls ${waterCalls} · ${probe.events.count}/${C.capacity} rings · one ${C.resolution}² target\nRipple emitter + pass submission CPU p95: ${(times[Math.floor(times.length*.95)]??0).toFixed(2)} ms\nRipple pass GPU p95: ${gt.length?(gt[Math.floor(gt.length*.95)]!).toFixed(2)+' ms':'timer unavailable / waiting'}\nRefresh ?units=1000 for stress case. Rust dots are movement fixtures using the real water renderer.`;
 }
 frame++;requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
