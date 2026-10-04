/** Synthetic shared-renderer ray benchmark. Run with npm run bench:scenery-rays.
 * No network, assets, WebGL, simulation or map changes. The old full scan is kept
 * here only as a comparison oracle; distances must agree before timings matter. */
import {Scene,Group,Mesh,BoxGeometry,MeshStandardMaterial,Raycaster,Vector3} from 'three';
import {PropField} from '../../src/render/prop/propField';
import {materializePlacement} from '../../src/render/prop/staticPlacement';
const field=new PropField(new Scene(),new Map()),internal=field as any;
Object.defineProperty(internal.referenceGround,'ready',{get:()=>Promise.resolve()});
const prototype=new Group();prototype.add(new Mesh(new BoxGeometry(1,5,1),new MeshStandardMaterial()));
internal.protos.set('tree#base',Promise.resolve(prototype));
field.sync(Array.from({length:100000},(_,i)=>({id:`tree.${i}`,asset:'tree',x:(i%316)*1.6,y:Math.floor(i/316)*1.6})));await field.ready();
const rays=Array.from({length:100},(_,i)=>new Raycaster(new Vector3(20.5+(i%10)*20.8,1,20+(i%7)*19.2),new Vector3(.08,0,-1).normalize(),0,8));
const brute=(ray:Raycaster)=>{let distance=ray.far;const point=new Vector3();for(const root of internal.placed.values()){const bounds=root.userData.cameraBounds;if(!bounds||!ray.ray.intersectBox(bounds,point)||point.distanceTo(ray.ray.origin)>distance)continue;for(const hit of ray.intersectObject(materializePlacement(root),true))if(hit.distance<distance)distance=hit.distance;}return distance;};
const sample=(f:(r:Raycaster)=>number)=>{const t=performance.now();const results=rays.map(f);return {ms:performance.now()-t,results};};
const before=sample(brute),after=sample(r=>field.cameraObstruction(r));
if(before.results.some((v,i)=>Math.abs(v-after.results[i])>1e-6))throw Error('Spatial query changed a hit distance');
console.log(JSON.stringify({props:internal.placed.size,cells:internal.cells.size,rays:rays.length,beforeMs:before.ms,afterMs:after.ms,maxDistanceDifference:Math.max(...before.results.map((v,i)=>Math.abs(v-after.results[i])))}));
field.destroy();
