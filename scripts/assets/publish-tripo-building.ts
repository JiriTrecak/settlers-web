/** Publish one adapted building using its explicit existing-game bindings. */
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {originalPackage,addBytes,addFile,publishOriginals} from './original-publication';

const slug=process.argv[2];
if(!slug||!/^[a-z0-9-]+$/.test(slug))throw Error('Usage: publish-tripo-building.ts <source-slug>');
const source=`.asset-work/build/buildings/${slug}`;
const config=JSON.parse(await readFile(`${source}/asset.json`,'utf8'));
const spec=config.publication;
if(!spec?.id||!spec.renderIds?.length)throw Error('Explicit publication bindings required');
const pack=originalPackage(spec.id,config.name,'building','generated');
for(const [role,format,path] of [
 ['geometry','glb','model.glb'],['source','blend',config.blend],
 ['reference','png','reference.png'],['preview','png','render.png'],
] as const)await addFile(pack,role,format,`${source}/${path}`);
const glb=await readFile(`${source}/model.glb`),length=glb.readUInt32LE(12);
const document=JSON.parse(glb.subarray(20,20+length).toString());
if(document.materials.length!==1)throw Error('Expected the adapted single-atlas building export');
const material=document.materials[0];
function textureBytes(index:number):Buffer {
 const image=document.images[document.textures[index].source],view=document.bufferViews[image.bufferView];
 const start=28+length+(view.byteOffset??0);return glb.subarray(start,start+view.byteLength);
}
const textures:NonNullable<typeof pack.definition.materials[number]['textures']>={};
const albedo=textureBytes(material.pbrMetallicRoughness.baseColorTexture.index);
addBytes(pack,'albedo','png',await sharp(albedo).png().toBuffer());textures.albedo={role:'albedo',index:1};
const team=material.extras?.teamColorMask==='baseColorAlpha';
if(team){addBytes(pack,'team_mask','png',await sharp(albedo).extractChannel('alpha').png().toBuffer());textures.teamMask={role:'team_mask',index:1};}
if(material.normalTexture){addBytes(pack,'normal','png',await sharp(textureBytes(material.normalTexture.index)).png().toBuffer());textures.normal={role:'normal',index:1};}
if(material.pbrMetallicRoughness.metallicRoughnessTexture){addBytes(pack,'roughness','png',await sharp(textureBytes(material.pbrMetallicRoughness.metallicRoughnessTexture.index)).extractChannel(1).png().toBuffer());textures.roughness={role:'roughness',index:1};}
addBytes(pack,'image','png',await sharp(`${source}/render.png`).resize(128,128,{fit:'contain',background:'#000000'}).png().toBuffer());
addBytes(pack,'generation','json',Buffer.from(JSON.stringify({
 ...JSON.parse(await readFile(`${source}/provenance.json`,'utf8')),config,
 rebuild:`python ${source}/prepare_texture.py; node experiments/building-studio/launch.mjs build ${slug}`,
 adapter:await readFile('experiments/building-studio/tripo_building.py','utf8'),
 maskAdapter:await readFile('experiments/building-studio/tripo_texture.py','utf8'),
},null,2)));
pack.definition.tags=['original',spec.faction??'neutral','tripo',...(team?['team-mask']:[])];
pack.definition.bindings={faction:spec.faction??'ants',profile:'building',render:[
 ...spec.renderIds.map((id:string)=>({id,geometry:{asset:spec.id,role:'geometry' as const,index:1},scale:1,healthHeight:spec.healthHeight})),
 ...(spec.iconIds??[]).map((id:string)=>({id,image:{asset:spec.id,role:'image' as const,index:1}})),
],scenery:[]};
pack.definition.capabilities={...(team?{teamColor:{mode:'mask' as const,slots:['TC_TeamColor'],mask:{role:'team_mask' as const,index:1}}}:{}),
 blocker:{shape:'box',size:spec.footprint,offset:[0,0]},groundContact:{mode:'pivot'},vegetationClearance:Math.max(...spec.footprint)/2};
pack.definition.materials=[{slot:material.name,shader:'standard',color:'#ffffff',roughness:.72,metalness:0,alphaMode:'opaque',alphaCutoff:.4,doubleSided:true,textures}];
await publishOriginals([pack],(index,changed)=>{
 const owned=new Set(pack.definition.bindings.render.map(r=>r.id));
 for(const a of index.values())if(a.id!==spec.id&&a.bindings.render.some(r=>owned.has(r.id))){a.bindings.render=a.bindings.render.filter(r=>!owned.has(r.id));a.revision++;changed.add(a.id);}
});
