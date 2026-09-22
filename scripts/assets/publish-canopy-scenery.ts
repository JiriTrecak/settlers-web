import {readFile} from 'node:fs/promises';
import {originalPackage,addBytes,addFile,publishOriginals,type OriginalPackage} from './original-publication';
function prepareGlb(bytes:Buffer,slug:string){
 const n=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+n).toString());let binary=bytes.subarray(28+n);
 for(const m of doc.materials??[]){
  const foliage=m.name==='Broadleaf cards';
  // Calibrate untextured Blender swatches to the reference shader's HDR light range.
  const base=m.pbrMetallicRoughness;base.baseColorFactor??=[1,1,1,1];for(let c=0;c<3;c++)base.baseColorFactor[c]*=.45;m.extras={...m.extras,referenceEnvironment:true,sourceShader:'plant',foliage,backsideLighting:foliage?.35:0,sourceShaderAttributes:{IsUseGroundColor:foliage?'true':'false'}};
  if(foliage){m.alphaMode='MASK';m.alphaCutoff=.4;m.doubleSided=true;}
 }
 for(const node of doc.nodes??[])node.extras={...node.extras,referenceEnvironment:true,plantHeight:slug==='canopy-oak'?6:32,...(slug==='canopy-oak'?{foliageWind:{amplitude:.10,speed:.18}}:{})};
 for(const mesh of doc.meshes??[])for(const prim of mesh.primitives){
  if(!doc.materials[prim.material]?.extras.foliage)continue;
  const count=doc.accessors[prim.attributes.POSITION].count,pad=Buffer.alloc((4-binary.length%4)%4);binary=Buffer.concat([binary,pad]);
  const data=Buffer.alloc(count*16);for(let i=0;i<count;i++){data.writeFloatLE(.5,i*16);data.writeFloatLE(.5,i*16+4);data.writeFloatLE(.5,i*16+8);data.writeFloatLE(1,i*16+12);}
  const view=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:binary.length,byteLength:data.length});binary=Buffer.concat([binary,data]);
  prim.attributes._LEAF=doc.accessors.length;doc.accessors.push({bufferView:view,componentType:5126,count,type:'VEC4'});
 }
 doc.buffers[0].byteLength=binary.length;let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
 const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+binary.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(binary.length);binHeader.writeUInt32LE(0x004e4942,4);return Buffer.concat([header,json,binHeader,binary]);
}

const packs:OriginalPackage[]=[];
for(const slug of ['canopy-mushrooms-ochre','canopy-mushrooms-russet','canopy-acorns','canopy-twig','canopy-ancient-tree','canopy-oak']){
 const id='asset.models.environment.'+slug,tree=slug==='canopy-oak',giant=slug==='canopy-ancient-tree';
 const p=originalPackage(id,slug.replaceAll('-',' '),tree?'tree':'prop','authored');
 addBytes(p,'geometry','glb',prepareGlb(await readFile('/tmp/utc-canopy-models/'+slug+'/geometry.glb'),slug));
 await addFile(p,'source','blend','/tmp/utc-canopy-models/'+slug+'/source.blend');
 addBytes(p,'generation','json',Buffer.from(JSON.stringify({method:'authored',originalPixels:true,recipe:'scripts/assets/build-canopy-scenery.py',textures:['woodland-bark','woodland-oak-leaves']},null,2)+'\n'));
 p.definition.bindings={profile:'model',render:[{id:'asset.scenery.'+slug,sceneryAsset:slug,geometry:{role:'geometry',index:1,asset:id},...(tree?{harvestAnimation:{role:'geometry' as const,index:1,asset:id}}:{})}],scenery:[{id:slug,name:p.definition.name,category:giant?'landmark':'foliage',type:'prop',geometry:{role:'geometry',index:1},...(giant?{blocker:{width:8,depth:8,shape:'ellipse' as const}}:{})}]};
 p.definition.capabilities={vegetationClearance:giant?5:tree?1.1:.2,groundContact:{mode:'pivot'},...(tree?{harvesting:{replacement:'asset.models.environment.woodland-pine-stump',definition:'resource.forest.tree'},wind:{mode:'tree' as const,strength:.1,speed:.18,stiffness:.8}}:{})};packs.push(p);
}
await publishOriginals(packs);
