import {Scene,WebGLRenderer,WebGLRenderTarget,OrthographicCamera,PerspectiveCamera,DirectionalLight,AmbientLight,Mesh,PlaneGeometry,MeshStandardMaterial,Frustum,Matrix4,Box3,PCFShadowMap,SRGBColorSpace,ACESFilmicToneMapping} from 'three';
import {PropField} from '../../../src/render/prop/propField';
import {ShaderDiagnostics} from '../../../src/render/display/shaderDiagnostics';
import {parseUtcMap} from '../../../src/shared/map/utcmap';
import {projectScene} from '../../../src/shared/authoring/project';
import {editorEntities,resourceStamps} from '../../../src/presentation/scenery';
import {sceneryCatalogue} from '../../../src/shared/assets/manifest';
const button=document.querySelector<HTMLButtonElement>('#run')!,status=document.querySelector('#status')!,report=document.querySelector('#report')!,preview=document.querySelector('#preview')!;
const select=document.querySelector<HTMLSelectElement>('#map')!,download=document.querySelector<HTMLButtonElement>('#download')!;
const comparison=document.querySelector<HTMLSelectElement>('#comparison')!,clock=document.querySelector<HTMLInputElement>('#clock')!;
const moving=document.querySelector<HTMLInputElement>('#moving')!;
download.onclick=()=>{const url=URL.createObjectURL(new Blob([report.textContent!],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`${select.value}-scenery-cells.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
// Cooperatively yield without nested/background timer throttling stretching an
// AB comparison over minutes. Timed regions still exclude task waits/readbacks.
const tasks:Array<()=>void>=[],channel=new MessageChannel();
channel.port1.onmessage=()=>tasks.shift()?.();
const pause=()=>new Promise<void>(r=>{tasks.push(r);channel.port2.postMessage(null);});
const stats=(values:number[])=>{const sorted=[...values].sort((a,b)=>a-b);return {mean:values.reduce((a,b)=>a+b,0)/values.length,median:sorted[Math.floor(sorted.length/2)],p95:sorted[Math.floor(sorted.length*.95)]};};
button.onclick=async()=>{
 button.disabled=select.disabled=comparison.disabled=clock.disabled=moving.disabled=download.disabled=true;preview.replaceChildren();let field:PropField|undefined,renderer:WebGLRenderer|undefined,target:WebGLRenderTarget|undefined;
 try{
  status.textContent=`Compiling ${select.selectedOptions[0].textContent} and loading its scenery…`;await pause();
  const map=parseUtcMap(await(await fetch(`/assets/maps/skirmish/${select.value}.utcmap`)).json());if(!map)throw Error('Invalid map');
  const compiled=projectScene(map)!;
  const stamps=[...compiled.stamps,...resourceStamps(editorEntities(map))].filter(s=>!s.asset.startsWith('reference-grass-'));
  const scene=new Scene(),layout={caster:48,scatter:comparison.value==='draw-keys'?48:24};
  field=new PropField(scene,new Map(sceneryCatalogue.assets.map(a=>[a.id,'/assets/'+a.file])),undefined,layout);
  field.setHeight((x,z)=>compiled.field.sample(x,z),compiled.field);field.sync(stamps);await field.ready();field.tick(Number(clock.value));
  const internalField=field as any,nativeCull=field.cull.bind(field);let useCompactedDraws=false;
  field.cull=(frustum,shadow=false)=>{
   if(useCompactedDraws){nativeCull(frustum,shadow);return;}
   internalField.draws.restore();
   for(const cell of internalField.cells.values()){cell.group.visible=!frustum||frustum.intersectsBox(cell.box);cell.scatter.visible=!shadow;}
  };
  const cachedDrawKey=internalField.draws.batchKey.bind(internalField.draws);
  // Previous production signature, retained only as an independent benchmark oracle.
  const uncachedDrawKey=(batch:import('three').InstancedMesh)=>{
   const materials=Array.isArray(batch.material)?batch.material:[batch.material];
   return JSON.stringify([batch.geometry.uuid,materials.map(m=>m.uuid),batch.castShadow,batch.receiveShadow,batch.renderOrder,batch.layers.mask,!!batch.instanceColor,batch.customDepthMaterial?.uuid,batch.customDistanceMaterial?.uuid,batch.userData.category,materials.some(m=>m.transparent)?batch.uuid:null]);
  };
  const failures=field.diagnostics().failed;if(failures.length)throw Error('Missing assets: '+failures.join(', '));
  renderer=new WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(640,480);renderer.shadowMap.enabled=true;renderer.shadowMap.type=PCFShadowMap;renderer.outputColorSpace=SRGBColorSpace;renderer.toneMapping=ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;preview.append(renderer.domElement);
  target=new WebGLRenderTarget(640,480);target.texture.colorSpace=SRGBColorSpace;
  scene.add(new AmbientLight(0xc5dcf4,1.3));const sun=new DirectionalLight(0xffecc5,2.5);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-100;sun.shadow.camera.right=100;sun.shadow.camera.top=100;sun.shadow.camera.bottom=-100;sun.shadow.camera.near=.1;sun.shadow.camera.far=400;sun.shadow.bias=-.0001;scene.add(sun,sun.target);
  const ground=new Mesh(new PlaneGeometry(640,640),new MeshStandardMaterial({color:0x72834c}));ground.rotation.x=-Math.PI/2;ground.position.set(256,-10,256);ground.receiveShadow=true;scene.add(ground);
  const gl=renderer.getContext() as WebGL2RenderingContext,ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
  renderer.debug.checkShaderErrors=false;
  const shaders=new ShaderDiagnostics(gl,failure=>{throw Error(`Shader failed: ${failure.name}: ${failure.program}\n${failure.vertex}\n${failure.fragment}`);});
  const shadowRender=renderer.shadowMap.render.bind(renderer.shadowMap);
  renderer.shadowMap.render=(lights,s,camera)=>{sun.shadow.updateMatrices(sun);field!.cull(sun.shadow.getFrustum(),true);shadowRender(lights,s,camera);};
  const views=[{name:'centre RTS',x:256,z:256,span:64,perspective:false},{name:'base RTS',x:90,z:90,span:64,perspective:false},{name:'forest RTS',x:192,z:150,span:64,perspective:false},{name:'tight RTS',x:192,z:150,span:32,perspective:false},{name:'overview',x:256,z:256,span:280,perspective:false},{name:'close forest',x:192,z:150,span:28,perspective:true}].map(v=>({...v,x:v.x*map.size/512,z:v.z*map.size/512}));
  const reference:Uint8Array[]=[],frameReference=new Map<string,string>(),samples:unknown[]=[];
  const keyMode=comparison.value==='draw-keys';
  const runs=keyMode?[false,true,false,true].map(cached=>({scatter:48,sphere:false,compact:true,cached})):comparison.value==='compact-cells'?[48,24,48,24].map(scatter=>({scatter,sphere:false,compact:true})):comparison.value==='draws'?[false,true,false,true].map(compact=>({scatter:48,sphere:false,compact})):comparison.value==='bounds'?[true,false,true,false].map(sphere=>({scatter:48,sphere,compact:false})):[24,48,24,48].map(scatter=>({scatter,sphere:false,compact:false}));
  for(const run of runs){
   const {scatter,sphere,compact}=run;
   const cached='cached' in run?run.cached:true;
   internalField.draws.batchKey=cached?cachedDrawKey:uncachedDrawKey;
   useCompactedDraws=compact;
   layout.scatter=scatter;layout.caster=comparison.value==='compact-cells'?scatter:48;
   const internal=field as any,start=performance.now();
   if(keyMode)internal.draws.sync(internal.batches);else{internal.allDirty=true;internal.rebuildBatches();}
   const rebuildMs=performance.now()-start,groupSamples:number[]=[];
   if(keyMode)for(let sample=0;sample<20;sample++){const t=performance.now();internal.draws.sync(internal.batches);if(sample>=5)groupSamples.push(performance.now()-t);}
   // Reproduce the previous culling bounds exactly, keeping identical geometry,
   // batches and per-batch spheres. Only the cell-level visibility test differs.
   if(sphere)for(const cell of internal.cells.values()){
    cell.box.makeEmpty();
    for(const batch of [...cell.casters.children,...cell.scatter.children])if(batch.boundingSphere)cell.box.union(batch.boundingSphere.getBoundingBox(new Box3()));
   }
   for(let index=0;index<views.length;index++){
    const v=views[index];status.textContent=`${compact?'Compacted cells':sphere?'Sphere':'Placement'} · ${scatter}m · ${v.name}`;await pause();
    const y=compiled.field.sample(v.x,v.z),camera=v.perspective?new PerspectiveCamera(55,4/3,.1,300):new OrthographicCamera(-v.span*4/3,v.span*4/3,v.span,-v.span,.1,1000);
    camera.position.set(v.x+v.span*.55,y+(v.perspective?8:v.span*.9),v.z+v.span*.7);camera.lookAt(v.x,y,v.z);camera.updateMatrixWorld();
    sun.position.set(v.x-70,y+110,v.z+60);sun.target.position.set(v.x,y,v.z);sun.target.updateMatrixWorld();sun.shadow.camera.updateProjectionMatrix();
    const frustum=new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    const move=(frame:number)=>{
     if(!moving.checked)return;
     const offset=(frame-8)*v.span*.015;
     camera.position.set(v.x+offset+v.span*.55,y+(v.perspective?8:v.span*.9),v.z+offset+v.span*.7);camera.lookAt(v.x+offset,y,v.z+offset);camera.updateMatrixWorld();
     frustum.setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
     sun.position.set(v.x+offset-70,y+110,v.z+offset+60);sun.target.position.set(v.x+offset,y,v.z+offset);sun.target.updateMatrixWorld();
    };
    const draw=()=>{field!.cull(frustum);renderer!.info.reset();renderer!.setRenderTarget(target!);renderer!.render(scene,camera);shaders.check(renderer!.info.programs??[]);field!.cull(null);};
    for(let warm=0;warm<3;warm++){draw();gl.finish();await pause();}
    const cpu:number[]=[],gpu:number[]=[],pending:WebGLQuery[]=[];
    let frameHashChecks=0,frameHashMismatches=0;
    for(let frame=0;frame<16;frame++){
     const q=ext?gl.createQuery():null;if(q)gl.beginQuery(ext.TIME_ELAPSED_EXT,q);
     const t=performance.now();move(frame);draw();cpu.push(performance.now()-t);
     if(q){gl.endQuery(ext.TIME_ELAPSED_EXT);pending.push(q);}gl.flush();
     if(moving.checked){
      // Outside CPU/GPU timing: verify every step of the pan, not only its last
      // image. Keep hashes instead of retaining hundreds of full-frame buffers.
      const pixels=new Uint8Array(640*480*4);renderer.readRenderTargetPixels(target,0,0,640,480,pixels);
      const digest=await crypto.subtle.digest('SHA-256',pixels),hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join(''),key=`${index}:${frame}`;
      const before=frameReference.get(key);if(before){frameHashChecks++;if(before!==hash)frameHashMismatches++;}else frameReference.set(key,hash);
     }
     await pause();
    }
    gl.finish();const deadline=performance.now()+3000;
    while(pending.length&&performance.now()<deadline){for(let i=pending.length-1;i>=0;i--){const q=pending[i];if(gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)){if(!gl.getParameter(ext.GPU_DISJOINT_EXT))gpu.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);pending.splice(i,1);}}if(pending.length)await pause();}
    pending.forEach(q=>gl.deleteQuery(q));
    const bytes=new Uint8Array(640*480*4);renderer.readRenderTargetPixels(target,0,0,640,480,bytes);
    const colors=new Set<number>();for(let i=0;i<bytes.length;i+=4)colors.add((bytes[i]<<16)|(bytes[i+1]<<8)|bytes[i+2]);
    if(colors.size<100)throw Error(`Empty or invalid render: ${v.name} (${colors.size} colours)`);
    let differences=0,maxDelta=0;if(!reference[index])reference[index]=bytes;else for(let i=0;i<bytes.length;i++){const d=Math.abs(bytes[i]-reference[index][i]);if(d){differences++;maxDelta=Math.max(maxDelta,d);}}
    samples.push({scatter,compact,cached,drawGroupSync:groupSamples.length?stats(groupSamples):undefined,drawGroups:compact?internal.draws.count:undefined,bounds:sphere?'sphere':'placement',view:v.name,batches:internal.batches.length,cells:internal.cells.size,rebuildMs,draws:renderer.info.render.calls,triangles:renderer.info.render.triangles,cpu:stats(cpu),gpu:gpu.length?stats(gpu):null,gpuSamples:gpu.length,pixelChannelsChanged:differences,maxChannelDelta:maxDelta,frameHashChecks,frameHashMismatches});
    report.textContent=JSON.stringify({map:map.name,props:stamps.length,windTimeMs:Number(clock.value),moving:moving.checked,samples},null,2);
    renderer.setRenderTarget(null);field.cull(frustum);renderer.render(scene,camera);field.cull(null);
   }
  }
  status.textContent='Complete — compare draw counts, CPU/GPU time and pixels across layouts';download.disabled=false;
  const still=document.createElement('canvas');still.width=640;still.height=480;still.getContext('2d')!.drawImage(renderer.domElement,0,0);preview.replaceChildren(still);
  ground.geometry.dispose();(ground.material as MeshStandardMaterial).dispose();sun.shadow.map?.dispose();
 }catch(e){status.textContent=String(e);}finally{field?.destroy();target?.dispose();renderer?.dispose();renderer?.forceContextLoss();button.disabled=select.disabled=comparison.disabled=clock.disabled=moving.disabled=false;}
};
