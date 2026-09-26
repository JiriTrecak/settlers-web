/** Shoreline props use the existing original woodland material family. */
import {readFile} from 'node:fs/promises';
import {originalPackage,addBytes,addFile,publishOriginals,type OriginalPackage} from './original-publication';
const items=[['root-snag','Uprooted river snag',10,2.2],['drift-log','Waterworn drift log',9,1.8],['drift-scraps','Broken driftwood',0,0],['bank-slabs','Rounded shoreline shelves',6,3.4],['reed-tuft','Quiet-water reeds',0,0],['broken-leaf-raft','Stranded leaf raft',5.5,2.8]] as const;
function calibrate(bytes:Buffer){
 const n=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+n).toString()),binary=bytes.subarray(28+n);
 let triangles=0;
 for(const mesh of doc.meshes)for(const p of mesh.primitives)triangles+=doc.accessors[p.indices].count/3;
 for(const m of doc.materials){const p=m.pbrMetallicRoughness;p.baseColorFactor??=[1,1,1,1];for(let i=0;i<3;i++)p.baseColorFactor[i]*=.45;
  m.extras={referenceEnvironment:true,sourceShader:'plant',foliage:false,backsideLighting:0,sourceShaderAttributes:{IsUseGroundColor:'false'}};
 }
 for(const node of doc.nodes??[])node.extras={...node.extras,referenceEnvironment:true};
 let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
 const h=Buffer.alloc(20),b=Buffer.alloc(8);h.writeUInt32LE(0x46546c67);h.writeUInt32LE(2,4);h.writeUInt32LE(28+json.length+binary.length,8);h.writeUInt32LE(json.length,12);h.writeUInt32LE(0x4e4f534a,16);b.writeUInt32LE(binary.length);b.writeUInt32LE(0x004e4942,4);
 return {bytes:Buffer.concat([h,json,b,binary]),triangles};
}
const packs:OriginalPackage[]=[];
for(const [short,name,width,depth]of items){
 const slug='woodland-'+short,id='asset.models.environment.'+slug,dir='/tmp/utc-waterfront/'+slug;
 const p=originalPackage(id,name,short==='reed-tuft'?'foliage':'prop','authored'),geometry=calibrate(await readFile(dir+'/geometry.glb'));
 addBytes(p,'geometry','glb',geometry.bytes);await addFile(p,'source','blend',dir+'/source.blend');await addFile(p,'generation','json',dir+'/generation.json');
 p.definition.bindings={profile:'model',render:[{id:'asset.scenery.'+slug,sceneryAsset:slug,geometry:{role:'geometry',index:1,asset:id}}],scenery:[{id:slug,name,category:short==='reed-tuft'?'foliage':'landmark',type:'prop',geometry:{role:'geometry',index:1},...(width?{blockers:[{width,depth,shape:'ellipse' as const}]}:{})}]};
 p.definition.capabilities={groundContact:{mode:'pivot'},vegetationClearance:width?Math.min(depth/2,1.7):.1};
 p.definition.tags=['original','woodland','waterfront'];packs.push(p);console.log(slug,geometry.triangles,'triangles');
}
await publishOriginals(packs);
