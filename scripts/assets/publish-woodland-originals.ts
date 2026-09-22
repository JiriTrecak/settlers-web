/** Publish original pines and a twig bridge, retaining the established render contract. */
import {readFile} from 'node:fs/promises';
import {originalPackage} from './original-publication';
import {createHash} from 'node:crypto';
import {withWorkspaceWriteLock} from '../../tooling/asset-studio/server/writeLock';
import {readPublished,planPublication} from '../../tooling/asset-studio/server/authoring/publication';
import {definitionBytes} from '../../tooling/asset-studio/server/authoring/packages';
import {assetDefinitionSchema,assetFolder,type AssetDefinition,type FileRole} from '../../src/shared/authoring/asset';
import {commitFiles} from '../../tooling/asset-studio/server/transaction';
const slugs=['woodland-pine-a','woodland-pine-b','woodland-pine-sapling','woodland-pine-stump','leafbound-twig-bridge'].filter(s=>!process.argv.includes('--pines-only')||['woodland-pine-a','woodland-pine-b','woodland-pine-sapling'].includes(s));
const id=(s:string)=>'asset.models.environment.'+s;
function prepare(bytes:Buffer,slug:string){
 const n=bytes.readUInt32LE(12),d=JSON.parse(bytes.subarray(20,20+n).toString());let binary=bytes.subarray(28+n);
 for(const m of d.materials){
  const foliage=m.name==='Original pine needles',p=m.pbrMetallicRoughness;p.baseColorFactor??=[1,1,1,1];
  // The game's day profile uses HDR directional lighting. Keep the original
  // albedo pixels intact and calibrate material reflectance in linear space.
  const reflectance=foliage?.40:slug.includes('pine')?.24:.62;
  for(let c=0;c<3;c++)p.baseColorFactor[c]*=reflectance;
  m.extras={referenceEnvironment:true,sourceShader:'plant',foliage,backsideLighting:foliage?.38:0,sourceShaderAttributes:{IsUseGroundColor:'false'}};
  if(foliage){m.alphaMode='MASK';m.alphaCutoff=.4;m.doubleSided=true;}
 }
 const tree=slug.includes('pine')&&!slug.includes('stump'),height=slug.includes('sapling')?3.2:12.6;
 for(const node of d.nodes??[])node.extras={...node.extras,referenceEnvironment:true,plantHeight:height,...(tree?{foliageWind:{amplitude:.1,speed:.18}}:{})};
 for(const m of d.meshes)for(const p of m.primitives){
  if(!d.materials[p.material].extras.foliage)continue;
  const count=d.accessors[p.attributes.POSITION].count;binary=Buffer.concat([binary,Buffer.alloc((4-binary.length%4)%4)]);const data=Buffer.alloc(count*16);
  for(let i=0;i<count;i++){data.writeFloatLE(.5,i*16);data.writeFloatLE(.5,i*16+4);data.writeFloatLE(.5,i*16+8);data.writeFloatLE(1,i*16+12);}
  const view=d.bufferViews.length;d.bufferViews.push({buffer:0,byteOffset:binary.length,byteLength:data.length});binary=Buffer.concat([binary,data]);p.attributes._LEAF=d.accessors.length;d.accessors.push({bufferView:view,componentType:5126,count,type:'VEC4'});
 }
 d.buffers[0].byteLength=binary.length;let json=Buffer.from(JSON.stringify(d));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);const header=Buffer.alloc(20),bin=Buffer.alloc(8);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+binary.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);bin.writeUInt32LE(binary.length);bin.writeUInt32LE(0x004e4942,4);return Buffer.concat([header,json,bin,binary]);
}
await withWorkspaceWriteLock(process.cwd(),async()=>{
 const root=process.cwd(),all=(await readPublished(root))!,index=new Map(all.map(a=>[a.id,a])),changed=new Set<string>(),staged=new Map<string,Buffer>();
 const add=(a:AssetDefinition)=>{assetDefinitionSchema.parse(a);index.set(a.id,a);changed.add(a.id);};
 for(const slug of slugs){
  const bridge=slug.includes('bridge'),tree=slug==='woodland-pine-a'||slug==='woodland-pine-b';
  const a=originalPackage(id(slug),slug.replaceAll('-',' '),bridge?'bridge':tree?'tree':'foliage','authored').definition;a.id=id(slug);a.name=slug.replaceAll('-',' ');a.kind=bridge?'bridge':tree?'tree':'foliage';a.tags=['original','woodland','forest'];a.revision=(index.get(a.id)?.revision??0)+1;a.resources=[];a.usesGeometry=true;
  a.provenance={method:'authored',licenseNote:'Original Blender geometry and procedural bark. Original pine-bough albedo generated with built-in ImageGen. All geometry and pixels independently authored.'};
  const source='art/sources/environment/'+slug+'/';
  for(const [role,format,file,i] of [['geometry','glb','geometry.glb',1],['source','blend',slug+'.blend',1],['albedo','png','albedo.png',1],...(!bridge&&!slug.includes('stump')?[['albedo','png','albedo_2.png',2]]:[])] as [FileRole,string,string,number][]){
   let b=await readFile(source+file);if(role==='geometry')b=prepare(b,slug);a.resources.push({role,index:i,format,sha256:createHash('sha256').update(b).digest('hex'),bytes:b.length});staged.set(assetFolder(a.id)+'/'+role+(i===1?'':'_'+i)+'.'+format,b);
  }
  a.bindings={profile:'model',render:bridge?[]:[{id:'asset.scenery.'+slug,sceneryAsset:slug,geometry:{role:'geometry',index:1,asset:a.id},...(tree?{harvestAnimation:{role:'geometry' as const,index:1,asset:a.id}}:{})}],scenery:[{id:slug,name:a.name,category:bridge?'landmark':'foliage',type:'prop',geometry:{role:'geometry',index:1},...(bridge?{deck:{width:6.6,depth:24,height:.35,arch:.75,thickness:.7,level:1,connections:{start:0,end:0}}}:{})}]};
  a.capabilities={groundContact:{mode:'pivot'},vegetationClearance:bridge?0:tree?1.2:.3,...(tree?{harvesting:{replacement:id('woodland-pine-stump'),definition:'resource.forest.tree'},animations:['hit','fall','decay'].map(clip=>({semantic:clip,clip,loop:false,events:[]}))}:{}),...(!bridge&&!slug.includes('stump')?{wind:{mode:'tree' as const,strength:.1,speed:.18,stiffness:.8}}:{})};add(a);
 }
 const plan=await planPublication(root,[...index.values()],changed,staged);await commitFiles(root,[...[...staged].map(([path,bytes])=>({path,bytes})),...[...changed].map(id=>({path:assetFolder(id)+'/asset.json',bytes:definitionBytes(index.get(id)!)})),...plan.writes]);console.log('Published original woodland assets and migrated pine recipes:',changed.size);
});
