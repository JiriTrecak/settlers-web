import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
const details=await fetch('/art/recipes/woodland-details.json').then(r=>r.json()) as string[];
const foliage=await fetch('/art/recipes/woodland-foliage.json').then(r=>r.json()) as string[];
const slugs=[...details,...foliage].map(n=>'woodland-'+n);
const select=document.querySelector<HTMLSelectElement>('#asset')!,stats=document.querySelector('#stats')!;
const renderer=new T.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.setClearColor(0x101412);renderer.toneMapping=T.ACESFilmicToneMapping;document.body.append(renderer.domElement);
const scene=new T.Scene(),camera=new T.PerspectiveCamera(38,innerWidth/innerHeight,.01,2000),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.autoRotateSpeed=.6;
scene.add(new T.HemisphereLight(0xe9ead2,0x403326,3.5));const sun=new T.DirectionalLight(0xffe7bf,5);sun.position.set(20,30,20);scene.add(sun);const fill=new T.DirectionalLight(0xc7d9ed,1.5);fill.position.set(-15,10,-20);scene.add(fill);
const root=new T.Group();scene.add(root);const loader=new GLTFLoader();const models=new Map<string,T.Group>();let triangles=0;
for(const slug of slugs){
 const option=document.createElement('option');option.value=slug;option.textContent=slug.replace('woodland-','').replaceAll('-',' ');select.append(option);
 const {scene:model}=await loader.loadAsync('/assets/library/asset.models.environment.'+slug+'/geometry.glb');
 model.traverse(o=>{if(o instanceof T.Mesh){triangles+=(o.geometry.index?.count??o.geometry.attributes.position!.count)/3;}});
 models.set(slug,model);stats.textContent=`Loaded ${models.size}/${slugs.length}`;
}
function frame(){const box=new T.Box3().setFromObject(root),center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3()),radius=size.length()/2;controls.target.copy(center);camera.position.copy(center).add(new T.Vector3(1.1,.9,1.25).normalize().multiplyScalar(radius/Math.sin(T.MathUtils.degToRad(camera.fov/2))*1.12));camera.near=Math.max(.01,radius/1000);camera.far=radius*30+100;camera.updateProjectionMatrix();controls.update();}
function show(){root.clear();const single=models.get(select.value);if(single){single.position.set(0,0,0);single.scale.setScalar(1);root.add(single);}else{let i=0;for(const model of models.values()){model.position.set(0,0,0);model.scale.setScalar(1);const box=new T.Box3().setFromObject(model),size=box.getSize(new T.Vector3()),c=box.getCenter(new T.Vector3()),s=5/Math.max(size.x,size.y,size.z);model.scale.setScalar(s);model.position.set((i%6)*7-c.x*s,-box.min.y*s,Math.floor(i/6)*7-c.z*s);root.add(model);i++;}}frame();stats.textContent=single?`${select.selectedOptions[0]!.text} · actual game GLB`:`${models.size} original models · ${triangles.toLocaleString()} triangles`;history.replaceState(null,'','#'+select.value);}
select.value=location.hash.slice(1)||'all';if(!select.value)select.value='all';select.onchange=show;show();
document.querySelector('#rotate')!.addEventListener('click',()=>controls.autoRotate=!controls.autoRotate);document.querySelector('#reset')!.addEventListener('click',frame);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});
