import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Box3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const folder='experiments/assets/environment/coniferous-pack/';
const manifest=JSON.parse(readFileSync(folder+'exports.json'));
const inventory=JSON.parse(readFileSync(folder+'source-inventory.json'));
const sourceNames=inventory.objects.map(o=>o.name).sort();
if(JSON.stringify(manifest.map(e=>e.source).sort())!==JSON.stringify(sourceNames))throw Error('Source/export inventory mismatch');
const results=[];
for(const e of manifest){
 const bytes=readFileSync(e.file);
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 gltf.scene.updateMatrixWorld(true);let triangles=0,meshes=0;
 gltf.scene.traverse(o=>{if(!o.isMesh)return;meshes++;const g=o.geometry;
  triangles+=(g.index?.count??g.attributes.position.count)/3;
  if(!g.attributes.color)throw Error(e.id+' lost palette');
  for(const a of Object.values(g.attributes))if(!Array.from(a.array).every(Number.isFinite))throw Error(e.id+' nonfinite geometry');
 });
 const box=new Box3().setFromObject(gltf.scene,true);
 if(box.isEmpty()||Math.abs(box.min.y)>.02||box.max.y<.02)throw Error(e.id+' invalid upright grounding');
 if(triangles!==e.triangles)throw Error(e.id+' triangle mismatch');
 const clips=gltf.animations.map(a=>({name:a.name,duration:a.duration}));
 if(e.id==='tree_primary'||e.id==='tree_secondary')for(const [name,duration] of [['hit',.6],['fall',1.8],['decay',6]]){
  const clip=clips.find(c=>c.name===name);if(!clip||Math.abs(clip.duration-duration)>.06)throw Error(e.id+' invalid '+name);
 }
 results.push({id:e.id,source:e.source,triangles,meshes,bounds:{min:box.min.toArray(),max:box.max.toArray()},clips});
}
const primary=manifest.find(e=>e.source==='SM_Coniferous_Trees_14'),secondary=manifest.find(e=>e.source==='SM_Coniferous_Trees_13');
if(primary?.id!=='tree_primary'||secondary?.id!=='tree_secondary')throw Error('Incorrect primary tree mapping');
const report={sourceSha256:createHash('sha256').update(readFileSync(folder+'source.blend')).digest('hex'),count:results.length,results};
writeFileSync(folder+'validation.json',JSON.stringify(report,null,2)+'\n');console.log('Validated',results.length,'individual exports, geometry, palette attributes, grounding and harvest clip durations.');
