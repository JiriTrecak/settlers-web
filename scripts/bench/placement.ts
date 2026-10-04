/** Static placement CPU benchmark. Textures are placeholders: this measures
 * object graphs and matrices, not image decoding, network or GPU preparation.
 * node --expose-gc --import tsx scripts/bench/placement.ts [geometry.glb] [count] */
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Texture,Object3D} from 'three';
import {transformedModel} from '../../src/render/prop/modelTransform';
import {staticPlacementFactory,updatePlacementWorld,placementBounds,type PlacementRoot} from '../../src/render/prop/staticPlacement';
import {batchStaticMaterials} from '../../src/render/prop/staticBatch';

const path=process.argv[2]??'assets/library/asset.models.environment.woodland-pine-sapling/geometry.glb';
const count=Number(process.argv[3]??10000);
if(!Number.isInteger(count)||count<1||count>100000)throw Error('Count must be an integer from 1 to 100000');
const loader=new GLTFLoader().register(()=>({name:'benchmark-textures',loadTexture:async()=>new Texture()}));
const file=readFileSync(path),gltf=await loader.parseAsync(file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength),'');
batchStaticMaterials(gltf.scene,!!gltf.animations.length);
const prototype=transformedModel(gltf.scene,{scale:1,pivot:[0,0,0],up:'Y',forward:'+Z'});
const flat=staticPlacementFactory(prototype);
const compact=staticPlacementFactory(prototype,true);
function measure(create:()=>PlacementRoot){
 global.gc?.();
 const roots:PlacementRoot[]=[],before=performance.now();
 for(let i=0;i<count;i++){const root=create();root.position.set(i%512,0,Math.floor(i/512));root.rotation.y=i*.17;roots.push(root);}
 const created=performance.now();
 for(const root of roots)updatePlacementWorld(root);
 const updated=performance.now();let nodes=roots[0] instanceof Object3D?1:0;for(const child of roots[0].children)child.traverse(()=>nodes++);
 for(const root of roots)placementBounds(root);
 return {createMs:created-before,matricesMs:updated-created,boundsMs:performance.now()-updated,nodesPerPlacement:nodes,totalNodes:count*nodes};
}
for(let i=0;i<100;i++){prototype.clone();flat();}
const clone=[],staticPlacements=[],compactPlacements=[];
for(let i=0;i<3;i++){clone.push(measure(()=>prototype.clone()));staticPlacements.push(measure(flat));compactPlacements.push(measure(compact));}
console.log(JSON.stringify({path,count,note:'CPU only; texture placeholders; three runs with optional explicit GC.',clone,staticPlacements,compactPlacements},null,2));
