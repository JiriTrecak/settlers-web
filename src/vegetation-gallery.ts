import {TreePlayer} from './render/prop/treePlayer';
import {AmbientLight,DirectionalLight,Scene,WebGLRenderer,OrthographicCamera,Box3,Vector3,Group,Mesh} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {publishedAssets} from './shared/assets/manifest';
import {assetUrls} from './shared/assets/urls.generated';
const urls=Object.fromEntries(publishedAssets.filter(r=>r.kind==='model'&&r.tags.includes('coniferous-pack')).map(r=>[r.scenery[0]?.id??r.id,assetUrls[r.outputs[0].path]]));
const canvas=document.querySelector('canvas')!,renderer=new WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
const scene=new Scene(),camera=new OrthographicCamera(-12,12,10,-10,.1,150);camera.position.set(0,22,28);
scene.add(new AmbientLight(0xffffff,1.5));const key=new DirectionalLight(0xffedcf,2.4);key.position.set(-8,14,12);scene.add(key);
const controls=new OrbitControls(camera,canvas);controls.target.set(0,0,0);controls.update();
let roots:Group[]=[];let players:TreePlayer[]=[];let started=0;
const entries=await Promise.all(Object.entries(urls).map(async ([path,url])=>({name:path.split('/').at(-1)!.replace('.glb',''),gltf:await new GLTFLoader().loadAsync(url)})));
function show(kind:string){
 roots.forEach(r=>scene.remove(r));roots=[];players.forEach(p=>p.dispose());players=[];started=performance.now();
 const list=entries.filter(e=>kind==='harvest'?e.name.startsWith('tree_'):kind==='trees'?e.name.startsWith('tree_')||e.name.startsWith('coniferous_'):e.name.includes(kind));
 const cols=Math.min(7,list.length),rows=Math.ceil(list.length/cols);
 list.forEach((e,i)=>{const root=new Group(),model=e.gltf.scene.clone(true);const box=new Box3().setFromObject(model,true),size=box.getSize(new Vector3());const scale=2.8/Math.max(size.x,size.y,size.z);model.scale.setScalar(scale);model.position.set(-(box.min.x+box.max.x)*.5*scale,-box.min.y*scale,-(box.min.z+box.max.z)*.5*scale);root.add(model);if(kind==='harvest')players.push(new TreePlayer(model,e.gltf.animations));root.position.set((i%cols-(cols-1)/2)*3.6,0,(Math.floor(i/cols)-(rows-1)/2)*4);scene.add(root);roots.push(root);});
 document.querySelector('#status')!.textContent=`${list.length} models loaded`;
 document.querySelector('#names')!.textContent=list.map((e,i)=>`${i+1}. ${e.name}`).join(' · ');
 camera.position.set(0,22,28);controls.target.set(0,0,0);controls.update();
}
document.querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.onclick=()=>show(b.dataset.kind!));show('trees');
function frame(){const tick=((performance.now()-started)/25)%400;for(const p of players)p.sample({hp:0,lastHitTick:0,fallTick:40,direction:{x:0,y:1}},Math.max(0,tick),72,240);const w=canvas.clientWidth,h=canvas.clientHeight;if(canvas.width!==Math.round(w*renderer.getPixelRatio())||canvas.height!==Math.round(h*renderer.getPixelRatio()))renderer.setSize(w,h,false);camera.left=-14;camera.right=14;camera.top=14*h/w;camera.bottom=-camera.top;camera.updateProjectionMatrix();controls.update();renderer.render(scene,camera);requestAnimationFrame(frame);}frame();
window.addEventListener('pagehide',()=>{controls.dispose();renderer.dispose();for(const e of entries)e.gltf.scene.traverse(o=>{if(o instanceof Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});});
