import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {batchCharacterMaterials} from '../../src/render/characters/materialBatch';
import assets from './assets.json';
const canvas=document.querySelector<HTMLCanvasElement>('#scene')!;
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;
const scene=new THREE.Scene();scene.background=new THREE.Color('#17191c');
const camera=new THREE.PerspectiveCamera(36,1,.01,2000),controls=new OrbitControls(camera,canvas);controls.autoRotateSpeed=1.4;
scene.add(new THREE.HemisphereLight('#fff4df','#5f655d',2.8));
const sun=new THREE.DirectionalLight('#ffe8c7',3);sun.position.set(8,12,10);scene.add(sun);
const fill=new THREE.DirectionalLight('#c9dcff',1);fill.position.set(-8,4,-4);scene.add(fill);
const select=document.querySelector<HTMLSelectElement>('#asset')!,clip=document.querySelector<HTMLSelectElement>('#clip')!,color=document.querySelector<HTMLSelectElement>('#color')!;
for(const [i,a] of assets.entries())select.add(new Option(a.name,String(i)));
const loader=new GLTFLoader();let root:THREE.Group|undefined,mixer:THREE.AnimationMixer|undefined,clips:THREE.AnimationClip[]=[],generation=0,disposeBatch:undefined|(()=>void),distance=10,center=new THREE.Vector3();
function recolor(){root?.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.name==='TC_TeamColor')m.color.set(color.value);});}
function reset(){camera.position.copy(center).add(new THREE.Vector3(0,.32,1).normalize().multiplyScalar(distance));controls.target.copy(center);controls.update();}
function animate(){mixer?.stopAllAction();const c=clips.find(c=>c.name===clip.value);if(c&&mixer){const a=mixer.clipAction(c);a.reset();a.setLoop(THREE.LoopRepeat,Infinity);a.play();}}
async function load(){
 const token=++generation,a=assets[Number(select.value)];document.querySelector('#stats')!.textContent='Loading '+a.name;
 const gltf=await loader.loadAsync(a.url);if(token!==generation)return;
 if(root){scene.remove(root);mixer?.stopAllAction();disposeBatch?.();root.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});}
 root=gltf.scene;scene.add(root);disposeBatch=batchCharacterMaterials(root,gltf.animations);mixer=new THREE.AnimationMixer(root);clips=gltf.animations;
 clip.replaceChildren(new Option('Static pose',''));for(const c of clips)clip.add(new Option(c.name,c.name));if(clips.some(c=>c.name==='idle'))clip.value='idle';animate();recolor();
 const box=new THREE.Box3().setFromObject(root);box.getCenter(center);distance=box.getSize(new THREE.Vector3()).length()*1.8;reset();
 const link=document.querySelector<HTMLAnchorElement>('#comparison')!;link.href=a.source+'/comparison.png';
 let meshes=0;root.traverse(o=>{if(o instanceof THREE.Mesh)meshes++;});document.querySelector('#stats')!.textContent=`${a.name}\n${a.triangles.toLocaleString()} triangles · ${a.primitives} exported primitives · ${meshes} runtime meshes\nDrag to orbit · wheel to zoom · team colors affect ownership surfaces only`;
 history.replaceState(null,'','?asset='+encodeURIComponent(a.name));
}
select.onchange=()=>void load();color.onchange=recolor;clip.onchange=animate;document.querySelector<HTMLButtonElement>('#reset')!.onclick=reset;
const initial=assets.findIndex(a=>a.name===new URLSearchParams(location.search).get('asset'));if(initial>=0)select.value=String(initial);
void load();let last=performance.now();function frame(now:number){const dt=Math.min(.05,(now-last)/1000);last=now;const w=innerWidth,h=innerHeight;if(canvas.width!==Math.floor(w*renderer.getPixelRatio())||canvas.height!==Math.floor(h*renderer.getPixelRatio())){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}mixer?.update(dt);controls.autoRotate=document.querySelector<HTMLInputElement>('#orbit')!.checked;controls.update(dt);renderer.render(scene,camera);requestAnimationFrame(frame);}requestAnimationFrame(frame);
