import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {applyPlayerMaterials} from '../../../src/render/settlement/playerMaterials';
const renderer=new T.WebGLRenderer({canvas:document.querySelector('canvas')!,antialias:true});renderer.setPixelRatio(devicePixelRatio);renderer.setSize(innerWidth,innerHeight-65);renderer.toneMapping=T.ACESFilmicToneMapping;
const scene=new T.Scene();scene.background=new T.Color('#171c20');scene.environment=new T.PMREMGenerator(renderer).fromScene(new RoomEnvironment(),.04).texture;scene.add(new T.HemisphereLight(0xffffff,0x596473,2));
const sun=new T.DirectionalLight(0xffffff,3);sun.position.set(-30,70,40);scene.add(sun);
const camera=new T.PerspectiveCamera(35,innerWidth/(innerHeight-65),.1,500);camera.position.set(12,68,96);const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,3,9);controls.update();
const loader=new GLTFLoader();
for(const [row,slug] of ['ants-queensguard-hall','beetles-carapace-hall'].entries()){
 const gltf=await loader.loadAsync('/assets/library/asset.models.buildings.'+slug+'/geometry.glb');
 for(const [column,owner] of [0,1,2,7].entries()){
  const obj=gltf.scene.clone(true);obj.traverse(o=>{if(o instanceof T.Mesh)o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();});applyPlayerMaterials(obj,owner);obj.position.set((column-1.5)*22,0,(row-.8)*27);scene.add(obj);
 }
}
for(const [column,suffix] of ['1','2','3','4','5','low','empty'].entries()){
 const gltf=await loader.loadAsync('/assets/library/asset.models.resources.amber-crystal-'+suffix+'/geometry.glb');gltf.scene.position.set((column-3)*11,0,37);scene.add(gltf.scene);
}
document.body.dataset.loaded='9';renderer.setAnimationLoop(()=>renderer.render(scene,camera));
