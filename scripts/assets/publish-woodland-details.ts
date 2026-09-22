/** Publish the independently authored woodland scenery collection. */
import {readFile} from 'node:fs/promises';
import {originalPackage,addBytes,addFile,publishOriginals,type OriginalPackage} from './original-publication';
const names=JSON.parse(await readFile('art/recipes/woodland-details.json','utf8')) as string[];
const packs:OriginalPackage[]=[];
function calibrated(bytes:Buffer){
 const length=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+length).toString()),binary=bytes.subarray(28+length);
 for(const m of doc.materials??[]){
  const p=m.pbrMetallicRoughness;p.baseColorFactor??=[1,1,1,1];
  for(let c=0;c<3;c++)p.baseColorFactor[c]*=.45;
  m.extras={referenceEnvironment:true,sourceShader:'plant',foliage:false,backsideLighting:0,sourceShaderAttributes:{IsUseGroundColor:'false'}};
 }
 for(const node of doc.nodes??[])node.extras={...node.extras,referenceEnvironment:true};
 let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
 const h=Buffer.alloc(20),b=Buffer.alloc(8);h.writeUInt32LE(0x46546c67);h.writeUInt32LE(2,4);h.writeUInt32LE(28+json.length+binary.length,8);h.writeUInt32LE(json.length,12);h.writeUInt32LE(0x4e4f534a,16);b.writeUInt32LE(binary.length);b.writeUInt32LE(0x004e4942,4);return Buffer.concat([h,json,b,binary]);
}
for(const name of names){
 const slug='woodland-'+name,id='asset.models.environment.'+slug,dir='art/sources/environment/'+slug;
 const bridge=name==='root-arch-bridge',a=originalPackage(id,slug.replaceAll('-',' '),bridge?'bridge':'prop','authored');
 addBytes(a,'geometry','glb',calibrated(await readFile(dir+'/geometry.glb')));
 await addFile(a,'albedo','png',dir+'/albedo_2.png',2);await addFile(a,'source','blend',dir+'/'+slug+'.blend');await addFile(a,'albedo','png',dir+'/albedo.png');await addFile(a,'generation','json',dir+'/generation.json');
 a.definition.bindings={profile:'model',render:bridge?[]:[{id:'asset.scenery.'+slug,sceneryAsset:slug,geometry:{role:'geometry',index:1,asset:id}}],scenery:[{id:slug,name:a.definition.name,category:'landmark',type:'prop',geometry:{role:'geometry',index:1},...(bridge?{deck:{width:3.0,depth:16,height:.48,arch:1.4,thickness:.7,level:1,connections:{start:0,end:0}}}:{}),...(name.includes('lantern')?{light:{x:.78,y:2.25,z:-.04,color:'#d8a457',intensity:1.6,range:5}}:{})}]};
 if(name==='amber-deposit')a.definition.bindings.render.push({id:'asset.resource.woodland-amber-deposit',geometry:{role:'geometry',index:1,asset:id}});
 a.definition.capabilities={groundContact:{mode:'pivot'},vegetationClearance:['ruined-watchtower','broken-trader-cart','giant-stump'].includes(name)?2:.25};packs.push(a);
}
await publishOriginals(packs);
