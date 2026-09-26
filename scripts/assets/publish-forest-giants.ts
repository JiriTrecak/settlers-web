/** Original canopy landmarks and a paintable mushroom ground-cover recipe. */
import {readFile} from 'node:fs/promises';
import {originalPackage,addBytes,addFile,publishOriginals,type OriginalPackage} from './original-publication';
import type {AssetDefinition} from '../../src/shared/authoring/asset';
const id=(slug:string)=>'asset.models.environment.'+slug;
const items:[string,string,number,number][]=[
 ['woodland-canopy-elder','Ancient canopy oak',8.2,8.2],
 ['woodland-canopy-spreading','Spreading canopy oak',8.2,8.2],
 ['woodland-great-broken-trunk','Great broken trunk',8.2,8.2],
 ['woodland-great-fallen-log','Great fallen hollow log',30,7],
 ['woodland-giant-mushroom-ochre','Giant ochre umbrella',2.8,2.8],
 ['woodland-giant-mushroom-russet','Giant russet umbrella',2.4,2.4],
 ['woodland-mushrooms-button','Woodland button mushrooms',0,0],
 ['woodland-mushrooms-fan','Woodland russet mushrooms',0,0],
];
function prepare(bytes:Buffer,slug:string){
 const n=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+n).toString());let binary=bytes.subarray(28+n);
 for(const m of doc.materials??[]){
  const foliage=m.name==='Broadleaf canopy',p=m.pbrMetallicRoughness;p.baseColorFactor??=[1,1,1,1];
  for(let c=0;c<3;c++)p.baseColorFactor[c]*=foliage?.28:m.name==='Painted woodland mushrooms'?.4:.45;
  m.extras={referenceEnvironment:true,sourceShader:'plant',foliage,backsideLighting:foliage?.3:0,sourceShaderAttributes:{IsUseGroundColor:'false'}};
  if(foliage){m.alphaMode='MASK';m.alphaCutoff=.4;m.doubleSided=true;}
 }
 for(const node of doc.nodes??[])node.extras={...node.extras,referenceEnvironment:true,...(slug.includes('canopy-')?{foliageWind:{amplitude:.1,speed:.16}}:{})};
 // Same leaf-lighting attribute used by the existing original woodland materials.
 for(const mesh of doc.meshes??[])for(const prim of mesh.primitives){
  if(!doc.materials[prim.material]?.extras.foliage)continue;
  const count=doc.accessors[prim.attributes.POSITION].count;binary=Buffer.concat([binary,Buffer.alloc((4-binary.length%4)%4)]);
  const data=Buffer.alloc(count*16);for(let i=0;i<count;i++){for(let c=0;c<3;c++)data.writeFloatLE(.5,i*16+c*4);data.writeFloatLE(1,i*16+12);}
  const view=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:binary.length,byteLength:data.length});binary=Buffer.concat([binary,data]);
  prim.attributes._LEAF=doc.accessors.length;doc.accessors.push({bufferView:view,componentType:5126,count,type:'VEC4'});
 }
 doc.buffers[0].byteLength=binary.length;let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
 const header=Buffer.alloc(20),bin=Buffer.alloc(8);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+binary.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);bin.writeUInt32LE(binary.length);bin.writeUInt32LE(0x004e4942,4);return Buffer.concat([header,json,bin,binary]);
}
const packs:OriginalPackage[]=[];
for(const suffix of ['bark','mushrooms']){
 const textureId='asset.textures.forest-giants-'+suffix;
 const p=originalPackage(textureId,'Forest giants · painted '+suffix,'texture','generated');
 await addFile(p,'albedo','png','art/assets/'+textureId+'/albedo.png');
 await addFile(p,'generation','json','art/assets/'+textureId+'/generation.json');
 packs.push(p);
}
for(const [slug,name,width,depth] of items){
 const p=originalPackage(id(slug),name,width?'prop':'foliage','authored'),dir='/tmp/utc-forest-giants/'+slug;
 addBytes(p,'geometry','glb',prepare(await readFile(dir+'/geometry.glb'),slug));
 await addFile(p,'source','blend',dir+'/source.blend');await addFile(p,'generation','json',dir+'/generation.json');
 p.definition.tags=['original','woodland',width?'forest-scale':'mushrooms'];
 // Overhanging crowns/caps are intentionally absent from ground collision.
 const blockers:NonNullable<AssetDefinition['bindings']['scenery'][number]['blockers']>=width?[{width,depth,...(slug.includes('fallen-log')?{}:{shape:'ellipse' as const})}]:[];
 p.definition.bindings={profile:'model',render:[{id:'asset.scenery.'+slug,sceneryAsset:slug,geometry:{role:'geometry',index:1,asset:id(slug)}}],scenery:[{id:slug,name,category:width?'landmark':'foliage',type:'prop',geometry:{role:'geometry',index:1},...(blockers.length?{blockers}:{})}]};
 p.definition.capabilities={groundContact:{mode:'pivot'},vegetationClearance:slug.includes('fallen-log')?4:width?width/2+.5:.2};
 packs.push(p);
}
const brush=originalPackage('recipe.foliage.mushroom-patches','Woodland mushroom patches','landscape-recipe','authored');
brush.definition.recipe={type:'ground-cover',species:[{asset:id('woodland-mushrooms-button'),weight:3},{asset:id('woodland-mushrooms-fan'),weight:2}],density:1,pattern:'patches',spacing:1.8,probability:.65,jitter:.8,scaleMin:.6,scaleMax:1.25,maxSlope:.9,waterClearance:.5,objectClearance:.2,edgeFade:1.2,minSpacing:1.2,patchiness:{scale:5,strength:.7}};
packs.push(brush);
await publishOriginals(packs);
