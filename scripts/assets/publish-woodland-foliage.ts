/** Original meadow cards and simple geometric water plants. */
import {readFile} from 'node:fs/promises';
import {originalPackage,addBytes,addFile,publishOriginals,type OriginalPackage} from './original-publication';
const names=JSON.parse(await readFile('art/recipes/woodland-foliage.json','utf8')) as string[],packs:OriginalPackage[]=[];
function prepare(bytes:Buffer,name:string){
 const length=bytes.readUInt32LE(12),d=JSON.parse(bytes.subarray(20,20+length).toString());let binary=bytes.subarray(28+length);
 const lily=name.startsWith('lily'),height=lily?.1:name.includes('high')?1.6:name==='grass-messy'?1:.72;
 for(const m of d.materials??[]){const p=m.pbrMetallicRoughness;p.baseColorFactor??=[1,1,1,1];for(let c=0;c<3;c++)p.baseColorFactor[c]*=.55;
  m.doubleSided=true;m.extras={referenceEnvironment:true,sourceShader:'grass',foliage:false,backsideLighting:0,sourceShaderAttributes:lily?{IsLaying:'true'}:{IsUseGroundColor:'true'}};
  if(p.baseColorTexture){m.alphaMode='MASK';m.alphaCutoff=.4;}
 }
 for(const node of d.nodes??[])node.extras={...node.extras,referenceEnvironment:true,plantHeight:height};
 for(const mesh of d.meshes)for(const p of mesh.primitives){
  const count=d.accessors[p.attributes.POSITION].count;binary=Buffer.concat([binary,Buffer.alloc((4-binary.length%4)%4)]);const data=Buffer.alloc(count*16);
  for(let i=0;i<count;i++){data.writeFloatLE(.5,i*16);data.writeFloatLE(.5,i*16+4);data.writeFloatLE(.5,i*16+8);}
  const view=d.bufferViews.length;d.bufferViews.push({buffer:0,byteOffset:binary.length,byteLength:data.length});binary=Buffer.concat([binary,data]);p.attributes._LEAF=d.accessors.length;d.accessors.push({bufferView:view,componentType:5126,count,type:'VEC4'});
 }
 d.buffers[0].byteLength=binary.length;let json=Buffer.from(JSON.stringify(d));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);const h=Buffer.alloc(20),b=Buffer.alloc(8);h.writeUInt32LE(0x46546c67);h.writeUInt32LE(2,4);h.writeUInt32LE(28+json.length+binary.length,8);h.writeUInt32LE(json.length,12);h.writeUInt32LE(0x4e4f534a,16);b.writeUInt32LE(binary.length);b.writeUInt32LE(0x004e4942,4);return Buffer.concat([h,json,b,binary]);
}
for(const name of names){
 const slug='woodland-'+name,id='asset.models.environment.'+slug,dir='art/sources/environment/'+slug,p=originalPackage(id,slug.replaceAll('-',' '),'foliage','authored');
 addBytes(p,'geometry','glb',prepare(await readFile(dir+'/geometry.glb'),name));await addFile(p,'source','blend',dir+'/'+slug+'.blend');await addFile(p,'generation','json',dir+'/generation.json');
 if(name.startsWith('grass'))await addFile(p,'albedo','png',dir+'/albedo.png');
 p.definition.bindings={profile:'model',render:[],scenery:[{id:slug,name:p.definition.name,category:'foliage',type:'prop',geometry:{role:'geometry',index:1}}]};
 p.definition.capabilities={groundContact:{mode:name.startsWith('lily')?'water':'terrain'},...(!name.startsWith('lily')?{wind:{mode:'grass',strength:.12,speed:.2,stiffness:.75}}:{})};packs.push(p);
}
await publishOriginals(packs);
