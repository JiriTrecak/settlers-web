/** Bake bounded-error index-only LODs; original vertices/materials and Blender sources stay intact. */
import fs from 'node:fs/promises';
import {MeshoptSimplifier} from 'meshoptimizer';
await MeshoptSimplifier.ready;
for(const name of ['pine-1','pine-2','pine-3']){
 const file=`assets/ant-colony/${name}.glb`,buf=await fs.readFile(file),jl=buf.readUInt32LE(12),doc=JSON.parse(buf.toString('utf8',20,20+jl)),bin=buf.subarray(28+jl);
 let chunks=[bin],length=bin.length,before=0,after=0;
 const read=(id,components)=>{const a=doc.accessors[id],v=doc.bufferViews[a.bufferView],bytes=a.componentType===5126||a.componentType===5125?4:2,stride=v.byteStride??bytes*components,offset=(v.byteOffset??0)+(a.byteOffset??0);const out=new Float32Array(a.count*components);for(let i=0;i<a.count;i++)for(let j=0;j<components;j++)out[i*components+j]=a.componentType===5126?bin.readFloatLE(offset+i*stride+j*bytes):bytes===4?bin.readUInt32LE(offset+i*stride+j*bytes):bin.readUInt16LE(offset+i*stride+j*bytes);return out;};
 for(const mesh of doc.meshes)for(const p of mesh.primitives){
  const pos=read(p.attributes.POSITION,3),index=Uint32Array.from(read(p.indices,1));
  const [simplified,error]=MeshoptSimplifier.simplify(index,pos,3,Math.floor(index.length*.35/3)*3,.015,['Permissive']);
  before+=index.length/3;after+=simplified.length/3;
  const padding=(4-length%4)%4;if(padding){chunks.push(Buffer.alloc(padding));length+=padding;}
  const bytes=Buffer.from(simplified.buffer,simplified.byteOffset,simplified.byteLength),view=doc.bufferViews.length;
  doc.bufferViews.push({buffer:0,byteOffset:length,byteLength:bytes.length,target:34963});chunks.push(bytes);length+=bytes.length;
  p.indices=doc.accessors.length;doc.accessors.push({bufferView:view,componentType:5125,count:simplified.length,type:'SCALAR'});
  p.extras={...p.extras,lodError:error};
 }
 doc.buffers[0].byteLength=length;const json=Buffer.from(JSON.stringify(doc));const jp=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]),bp=Buffer.concat(chunks),header=Buffer.alloc(20),bh=Buffer.alloc(8);
 header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+jp.length+bp.length,8);header.writeUInt32LE(jp.length,12);header.writeUInt32LE(0x4e4f534a,16);bh.writeUInt32LE(bp.length);bh.writeUInt32LE(0x004e4942,4);
 await fs.writeFile(`assets/ant-colony/${name}-lod.glb`,Buffer.concat([header,jp,bh,bp]));console.log(name,{before,after});
}
