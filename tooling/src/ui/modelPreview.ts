/** Inspect one published model on demand. Preview code stays out of the initial Studio bundle. */
import {AmbientLight,Box3,Color,DirectionalLight,PerspectiveCamera,Scene,Vector3,WebGLRenderer,Mesh,AnimationMixer} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
export async function modelPreview(host:HTMLElement,url:string):Promise<()=>void>{
 const renderer=new WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(new Color('#151518'));host.replaceChildren(renderer.domElement);
 const scene=new Scene(),camera=new PerspectiveCamera(36,1,.01,1000),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;scene.add(new AmbientLight(0xffffff,2));const light=new DirectionalLight(0xffdfaf,3);light.position.set(5,9,5);scene.add(light);
 const gltf=await new GLTFLoader().loadAsync(url);scene.add(gltf.scene);const bounds=new Box3().setFromObject(gltf.scene),center=bounds.getCenter(new Vector3()),extent=bounds.getSize(new Vector3()).length();camera.position.copy(center).add(new Vector3(extent*.9,extent*.55,extent*1.2));controls.target.copy(center);camera.far=Math.max(100,extent*10);camera.updateProjectionMatrix();const mixer=new AnimationMixer(gltf.scene);const idle=gltf.animations.find(c=>/idle/i.test(c.name));if(idle)mixer.clipAction(idle).play();let previous=performance.now(),frame=0;
 const draw=()=>{if(!host.isConnected){dispose();return;}const now=performance.now();mixer.update(Math.min(.05,(now-previous)/1000));previous=now;const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();controls.update();renderer.render(scene,camera);frame=requestAnimationFrame(draw);};
 const dispose=()=>{cancelAnimationFrame(frame);controls.dispose();mixer.stopAllAction();gltf.scene.traverse(o=>{if(o instanceof Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});renderer.dispose();};draw();return dispose;
}
