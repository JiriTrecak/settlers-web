import {WebGLRenderer,Scene,PerspectiveCamera,AmbientLight,DirectionalLight,Box3,Vector3,WebGLRenderTarget,Mesh,Texture} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {EmbeddedTexturePool} from '../../../src/render/loading/embeddedTextures';
import {referenceMaterialPlugin} from '../../../src/render/prop/referenceMaterial';
import models from '../../../assets/authoring/models.json';
const status=document.querySelector('#status')!,result=document.querySelector('#result')!,preview=document.querySelector('#preview')!,button=document.querySelector<HTMLButtonElement>('#run')!;
const files=[...new Set(models.filter(m=>m.scenery.length).flatMap(m=>m.geometry))];
const buffers=new Map<string,ArrayBuffer>();
await Promise.all(files.map(async file=>buffers.set(file,await(await fetch('/'+file)).arrayBuffer())));
status.textContent=`${files.length} scenery models downloaded. Ready.`;
async function run(shared:boolean){
 const pool=new EmbeddedTexturePool(),loader=new GLTFLoader().register(referenceMaterialPlugin);if(shared)loader.register(parser=>pool.plugin(parser));
 const start=performance.now(),gltfs=await Promise.all(files.map(file=>loader.parseAsync(buffers.get(file)!.slice(0),'/'))),loadMs=performance.now()-start;
 const renderer=new WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(256,256);preview.append(renderer.domElement);
 const gl=renderer.getContext(),original=gl.texSubImage2D;let uploads=0,uploadMs=0;
 gl.texSubImage2D=function(...args:any[]){const t=performance.now();uploads++;try{return original.apply(this,args as any);}finally{uploadMs+=performance.now()-t;}} as typeof original;
 let drawing='setup';const allocations=new Map<WebGLTexture,string>(),create=gl.createTexture.bind(gl),remove=gl.deleteTexture.bind(gl);
 gl.createTexture=()=>{const texture=create();if(texture)allocations.set(texture,drawing);return texture;};gl.deleteTexture=t=>{if(t)allocations.delete(t);remove(t);};
 const target=new WebGLRenderTarget(256,256),camera=new PerspectiveCamera(35,1,.01,1000),scene=new Scene();
 scene.add(new AmbientLight(0xffffff,1.5));const sun=new DirectionalLight(0xffead6,2.5);sun.position.set(10,15,12);scene.add(sun);
 const pixels:Uint8Array[]=[];const nonemptyPixels:number[]=[];let textures=0;
 for(let i=0;i<gltfs.length;i++){
  drawing=files[i];const root=gltfs[i].scene;scene.add(root);root.updateMatrixWorld(true);
  const box=new Box3().setFromObject(root),center=box.getCenter(new Vector3()),size=box.getSize(new Vector3()).length();
  camera.position.copy(center).add(new Vector3(.9,.65,1.3).normalize().multiplyScalar(size*1.8));camera.far=Math.max(1000,size*10);camera.updateProjectionMatrix();camera.lookAt(center);
  renderer.setRenderTarget(target);renderer.render(scene,camera);const data=new Uint8Array(256*256*4);renderer.readRenderTargetPixels(target,0,0,256,256,data);pixels.push(data);let visible=0;for(let p=0;p<data.length;p+=4)if(data[p]||data[p+1]||data[p+2])visible++;nonemptyPixels.push(visible);
  renderer.setRenderTarget(null);renderer.render(scene,camera);scene.remove(root);
  textures=renderer.info.memory.textures;
 }
 gl.texSubImage2D=original;
 const summary={shared,loadMs,uploads,uploadMs,textures,pool:pool.diagnostics(),emptyModels:files.filter((_,i)=>!nonemptyPixels[i]),rendererTexturesAfterDispose:-1,modelTexturesAfterDispose:-1};
 const modelHandles=new Set<WebGLTexture>();
 for(const gltf of gltfs)gltf.scene.traverse(o=>{if(o instanceof Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])for(const t of Object.values(m))if(t instanceof Texture){const handle=(renderer.properties.get(t) as any).__webglTexture;if(handle)modelHandles.add(handle);}});
 for(const gltf of gltfs)gltf.scene.traverse(o=>{if(o instanceof Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){for(const t of Object.values(m))if(t instanceof Texture)t.dispose();m.dispose();}}});
 pool.dispose();target.dispose();renderer.dispose();summary.rendererTexturesAfterDispose=renderer.info.memory.textures;summary.modelTexturesAfterDispose=[...modelHandles].filter(handle=>allocations.has(handle)).length;renderer.forceContextLoss();return {summary,pixels};
}
button.onclick=async()=>{button.disabled=true;preview.replaceChildren();try{
 status.textContent='Comparing all scenery models and verifying GPU cleanup…';
 const reversed=(document.querySelector('#reverse') as HTMLInputElement).checked;const first=await run(reversed),second=await run(!reversed),a=reversed?second:first,b=reversed?first:second;let changed=0,max=0;const mismatches:string[]=[];
 for(let i=0;i<files.length;i++){let different=false;for(let j=0;j<a.pixels[i].length;j++){const delta=Math.abs(a.pixels[i][j]-b.pixels[i][j]);if(delta){changed++;different=true;max=Math.max(max,delta);}}if(different)mismatches.push(files[i]);}
 const report={models:files.length,changedChannels:changed,maxChannelDelta:max,mismatches,before:a.summary,after:b.summary};result.textContent=JSON.stringify(report,null,2);status.textContent=changed||a.summary.emptyModels.length||b.summary.emptyModels.length||a.summary.modelTexturesAfterDispose||b.summary.modelTexturesAfterDispose||a.summary.rendererTexturesAfterDispose!==b.summary.rendererTexturesAfterDispose?'FAIL — see report':'PASS — every rendered pixel matches; model GPU textures released';
 }catch(e){status.textContent=String(e);}finally{button.disabled=false;}};
