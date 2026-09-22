import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {withWorkspaceWriteLock} from '../../tooling/asset-studio/server/writeLock';
import {readPublished,planPublication} from '../../tooling/asset-studio/server/authoring/publication';
import {definitionBytes} from '../../tooling/asset-studio/server/authoring/packages';
import {assetDefinitionSchema,assetFolder,type AssetDefinition} from '../../src/shared/authoring/asset';
import {commitFiles} from '../../tooling/asset-studio/server/transaction';
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
/** Preserve source pixels and mesh topology; explicitly mark the shared lighting/wind contract. */
function prepareGlb(bytes:Buffer,slug:string){
 const n=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+n).toString());let binary=bytes.subarray(28+n);
 for(const m of doc.materials??[]){
  const foliage=m.name==='Autumn leaf cards'||!!m.extras?.foliage;
  // Calibrate untextured Blender swatches to the reference shader's HDR light range.
  const base=m.pbrMetallicRoughness;if(base?.baseColorFactor&&!base.baseColorTexture)for(let c=0;c<3;c++)base.baseColorFactor[c]*=.22;if(m.name==='Autumn leaf cards'){base.baseColorFactor=slug.includes('copper')?[.20,.14,.085,1]:[.20,.31,.12,1];}m.extras={...m.extras,referenceEnvironment:true,noShadow:slug.includes('litter')||slug.includes('grass'),sourceShader:'plant',foliage,backsideLighting:foliage?.35:0,sourceShaderAttributes:{IsUseGroundColor:'false'}};
  if(foliage){m.alphaMode='MASK';m.alphaCutoff=.4;m.doubleSided=true;}
 }
 for(const node of doc.nodes??[])node.extras={...node.extras,referenceEnvironment:true,plantHeight:slug.includes('tree')?8:2,foliageWind:{amplitude:slug.includes('tree')?.09:.025,speed:.20}};
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
await withWorkspaceWriteLock(process.cwd(),async()=>{
 const root=process.cwd(),all=(await readPublished(root))!,index=new Map(all.map(a=>[a.id,a])),changed=new Set<string>(),staged=new Map<string,Buffer>();
 const add=(input:unknown)=>{const a=assetDefinitionSchema.parse(input);index.set(a.id,a);changed.add(a.id);return a;};
 const stage=async(a:AssetDefinition,role:AssetDefinition['resources'][number]['role'],format:string,path:string,prepare=false)=>{
  let bytes=await readFile(path);if(prepare)bytes=prepareGlb(bytes,a.id);
  a.resources.push({role,index:1,format,sha256:hash(bytes),bytes:bytes.length});staged.set(assetFolder(a.id)+'/'+role+'.'+format,bytes);
 };
 for(const slug of ['autumn-tree-gold','autumn-tree-copper','autumn-shrub-gold','autumn-shrub-copper','autumn-leaf-litter','autumn-stump','autumn-grass']){
  const id='asset.models.environment.'+slug,tree=slug.includes('tree'),shrub=slug.includes('shrub');
  const a=structuredClone(index.get('asset.models.environment.canopy-oak')!);a.id=id;a.name=slug.replaceAll('-',' ');a.kind=tree?'tree':(shrub||slug.includes('litter')||slug.includes('grass'))?'foliage':'prop';a.tags=['autumn','original','amberleaf'];a.resources=[];a.revision=1;
  a.provenance={method:'authored',licenseNote:'Original procedural geometry and ImageGen leaf albedo. No imported tree geometry or textures.',generation:{role:'generation',index:1}};
  await stage(a,'geometry','glb','/tmp/utc-autumn-models/'+slug+'/geometry.glb',true);await stage(a,'source','blend','/tmp/utc-autumn-models/'+slug+'/source.blend');await stage(a,'generation','json','/tmp/utc-autumn-models/generation.json');
  if(tree||shrub)await stage(a,'albedo','png','/tmp/utc-autumn-models/leaves.png');
  a.bindings={profile:'model',render:[{id:'asset.scenery.'+slug,sceneryAsset:slug,geometry:{role:'geometry',index:1,asset:id},...(tree?{harvestAnimation:{role:'geometry',index:1,asset:id}}:{})}],scenery:[{id:slug,name:a.name,category:'foliage',type:'prop',geometry:{role:'geometry',index:1}}]};
  a.capabilities={vegetationClearance:tree?1.1:shrub?.25:0,groundContact:{mode:'pivot'},...(tree?{harvesting:{replacement:'asset.models.environment.autumn-stump',definition:'resource.forest.tree'},wind:{mode:'tree',strength:.09,speed:.2,stiffness:.8}}:shrub?{wind:{mode:'foliage',strength:.025,speed:.2,stiffness:.8}}:{})};add(a);
 }
 for(const [id,file,name] of [['asset.terrain.autumn-leaf-litter','ground','Autumn fallen leaves · albedo/roughness'],['asset.terrain.autumn-leaf-normal','normal','Autumn fallen leaves · normal/height']]){
  const a=structuredClone(index.get('asset.terrain.woodland-soil')!);a.id=id!;a.name=name!;a.kind='terrain-material';a.tags=['autumn','original'];a.resources=[];a.provenance={method:'generated',licenseNote:'Original ImageGen terrain texture; packed into renderer channels.',generation:{role:'generation',index:1}};
  await stage(a,'data','bin','/tmp/utc-autumn-models/'+file+'.bin');await stage(a,'generation','json','/tmp/utc-autumn-models/generation.json');if(file==='ground')await stage(a,'albedo','png','/tmp/utc-autumn-models/ground.png');add(a);
 }
 const meadow=structuredClone(index.get('recipe.grass.meadow')!);meadow.id='recipe.grass.autumn';meadow.name='Fallen-leaf meadow';meadow.tags=['autumn','original'];
 if(meadow.recipe?.type==='grass'){meadow.recipe.species=[{asset:'asset.models.environment.autumn-leaf-litter',weight:7},{asset:'asset.models.environment.autumn-grass',weight:5}];meadow.recipe.spacing=.9;meadow.recipe.probability=.72;meadow.recipe.scaleMin=.65;meadow.recipe.scaleMax=1.05;meadow.recipe.edgeFade=4;meadow.recipe.patchiness={scale:6,strength:.45};}add(meadow);
 const forest=structuredClone(index.get('recipe.forest.diverse')!);forest.id='recipe.forest.autumn';forest.name='Amberleaf woodland';forest.tags=['autumn','original'];
 if(forest.recipe?.type==='forest'){
  const f=forest.recipe;f.species=[{asset:'asset.models.environment.autumn-tree-gold',weight:3},{asset:'asset.models.environment.autumn-tree-copper',weight:2}];f.spacing=4.6;f.minSpacing=3.6;f.scaleMin=.85;f.scaleMax=1.25;f.probability=.95;
  if(f.edge){f.edge.species=[{asset:'asset.models.environment.autumn-shrub-gold',weight:2},{asset:'asset.models.environment.autumn-shrub-copper',weight:1}];f.edge.width=3;f.edge.spacing=2.2;f.edge.probability=.6;}
  for(const d of f.details??[])if(d.id==='undergrowth'){d.species=[{asset:'asset.models.environment.autumn-leaf-litter',weight:4},{asset:'asset.models.environment.autumn-grass',weight:2}];d.spacing=1.3;d.probability=.8;}
 }add(forest);
 const plan=await planPublication(root,[...index.values()],changed,staged);
 await commitFiles(root,[...[...staged].map(([path,bytes])=>({path,bytes})),...[...changed].map(id=>({path:assetFolder(id)+'/asset.json',bytes:definitionBytes(index.get(id)!)})),...plan.writes]);
 console.log('Published original autumn biome assets:',[...changed]);
});
