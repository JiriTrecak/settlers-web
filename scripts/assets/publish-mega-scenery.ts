/** Publish one Tripo-adapted mega-scenery landmark as canonical scenery, through the same
 *  asset.* commands as the workbench. Reads the disposable work directory that
 *  build-mega-scenery.py wrote; the package keeps every input, so a later rebuild materializes
 *  from art/assets via its build manifest (there is no second editable source tree).
 *  node --import tsx scripts/assets/publish-mega-scenery.ts <slug>
 */
import {readFile} from 'node:fs/promises';
import {AuthoringStore} from '../../tooling/asset-studio/server/authoring/store';
import type {AssetDefinition,FileRole} from '../../src/shared/authoring/asset';

const slug=process.argv[2];
if(!slug||!/^[a-z0-9-]+$/.test(slug))throw Error('Usage: publish-mega-scenery.ts <slug>');
const work=`.asset-work/build/scenery/${slug}`,id='asset.models.environment.'+slug;
const config=JSON.parse(await readFile(`${work}/config.json`,'utf8'));
const blockers:NonNullable<AssetDefinition['bindings']['scenery'][number]['blockers']>=JSON.parse(await readFile(`${work}/blockers.json`,'utf8'));
const store=new AuthoringStore(process.cwd());

/** Route the Tripo PBR material through the environment shader path (biome ground tint, snow,
 *  source lighting) like the other woodland landmarks. Tone is calibrated per asset in config. */
function environmentMaterials(bytes:Buffer){
 const n=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+n).toString()),binary=bytes.subarray(28+n);
 for(const m of doc.materials??[]){
  const p=m.pbrMetallicRoughness??={};p.baseColorFactor=[...(config.tone??[1,1,1]),1];
  m.extras={referenceEnvironment:true,sourceShader:'plant',foliage:false,backsideLighting:0,sourceShaderAttributes:{IsUseGroundColor:config.groundColor?'true':'false'}};
 }
 let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
 const header=Buffer.alloc(20),bin=Buffer.alloc(8);
 header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+binary.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
 bin.writeUInt32LE(binary.length);bin.writeUInt32LE(0x004e4942,4);
 return Buffer.concat([header,json,bin,binary]);
}
async function upload(role:FileRole,format:string,bytes:Buffer,index=1){
 await store.dispatch({op:'asset.upload',id,expectedRevision:(await store.get(id)).revision,role,index,format,base64:bytes.toString('base64')});
}

try{await store.get(id);}catch{
 await store.dispatch({op:'asset.create',definition:{version:1,id,name:config.name,kind:'prop',revision:1,status:'draft',tags:[],resources:[],usesGeometry:false,
  transform:{scale:1,pivot:[0,0,0],up:'Y',forward:'+Z'},materials:[],bindings:{profile:'model',render:[],scenery:[]},capabilities:{},
  provenance:{method:'generated',licenseNote:'Original artwork created for Under the Canopy.'}}});
}
/** Tool-facing names in the work directory → canonical resources. Inputs only: outputs are rebuilt. */
const inputs:Record<string,[FileRole,string,number]>={'source.glb':['source','glb',2],'config.json':['source','json',3],'provenance.json':['source','json',4],'reference.png':['reference','png',1]};
for(const [file,[role,format,index]] of Object.entries(inputs))await upload(role,format,await readFile(`${work}/${file}`),index);
await upload('geometry','glb',environmentMaterials(await readFile(`${work}/model.glb`)));
await upload('source','blend',await readFile(`${work}/source.blend`),1);
await upload('preview','png',await readFile(`${work}/render.png`));
await upload('generation','json',Buffer.from(JSON.stringify({
 ...JSON.parse(await readFile(`${work}/provenance.json`,'utf8')),config,
 rebuild:`/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P scripts/assets/build-mega-scenery.py -- ${slug}; node --import tsx scripts/assets/publish-mega-scenery.ts ${slug}`,
 adapter:await readFile('scripts/assets/build-mega-scenery.py','utf8'),
},null,2)));
await upload('build','json',Buffer.from(JSON.stringify({version:1,category:'scenery',slug,files:Object.fromEntries(Object.entries(inputs).map(([file,[role,,index]])=>[file,{asset:id,role,index}]))},null,2)+'\n'));

const a=await store.get(id);
await store.dispatch({op:'asset.save',expectedRevision:a.revision,definition:{...a,name:config.name,tags:['original','woodland','forest-scale','mega','tripo'],
 bindings:{profile:'model',render:[{id:'asset.scenery.'+slug,sceneryAsset:slug,geometry:{role:'geometry',index:1,asset:id}}],
  scenery:[{id:slug,name:config.name,category:'landmark',type:'prop',geometry:{role:'geometry',index:1},...(blockers.length?{blockers}:{})}]},
 capabilities:{groundContact:{mode:'pivot'},vegetationClearance:config.vegetationClearance??(config.measure.diameter??config.measure.size)/2+1,...(config.canopy?{canopy:true as const}:{})},
 provenance:{method:'generated',licenseNote:'Original artwork created for Under the Canopy.',generation:{role:'generation',index:1}}}});
await store.dispatch({op:'asset.validate',id});
const published=await store.dispatch({op:'asset.publish',id,expectedRevision:(await store.get(id)).revision}) as AssetDefinition;
console.log('Published',id,'revision',published.revision,'blockers',blockers.length);
