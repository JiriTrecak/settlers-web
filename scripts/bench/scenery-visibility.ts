// CPU-only stationary visibility benchmark. No WebGL, assets or FPS claim.
import {Scene,Group,BoxGeometry,MeshBasicMaterial,InstancedMesh,Matrix4,Frustum,Plane,Vector3} from 'three';
import {VisibleSceneryDraws} from '../../src/render/prop/visibleDraws';
const scene=new Scene(),root=new Group();scene.add(root);
const geometry=new BoxGeometry(),materials=Array.from({length:64},()=>new MeshBasicMaterial()),batches=[];
for(let c=0;c<334;c++){const cell=new Group(),casters=new Group();root.add(cell);cell.add(casters);for(let i=0;i<32;i++){const b=new InstancedMesh(geometry,materials[i%64],10);for(let j=0;j<10;j++)b.setMatrixAt(j,new Matrix4().makeTranslation(c%20*24+j,0,Math.floor(c/20)*24));b.computeBoundingSphere();casters.add(b);batches.push(b);}}
const f=new Frustum(new Plane(new Vector3(1,0,0),-100),new Plane(new Vector3(-1,0,0),300),new Plane(new Vector3(0,1,0),100),new Plane(new Vector3(0,-1,0),100),new Plane(new Vector3(0,0,1),-100),new Plane(new Vector3(0,0,-1),300));
const draws=new VisibleSceneryDraws(scene,root);draws.sync(batches);draws.cull(f);draws.cull(f,true);
const run=(reuse:boolean)=>{const times=[];for(let i=0;i<120;i++){const t=performance.now();for(const shadow of [false,true]){if(!reuse||!draws.reuse(f,shadow))draws.cull(f,shadow);}times.push(performance.now()-t);}times.sort((a,b)=>a-b);return {median:times[60],p95:times[114]};};
run(false);run(true);console.log(JSON.stringify({batches:batches.length,scan:run(false),cached:run(true),repeatScan:run(false),repeatCached:run(true)}));draws.dispose();
