/** Publish the reference-based Acorn Main Hall without changing its gameplay contract. */
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {originalPackage,addBytes,addFile,publishOriginals} from './original-publication';
const source='art/sources/buildings/acorn-hall-tripo';
const id='asset.models.buildings.ants-acorn-hall';
const pack=originalPackage(id,'Acorn Main Hall','building','generated');
for(const [role,format,path] of [
 ['geometry','glb','model.glb'],['source','blend','acorn-hall-tripo.blend'],
 ['reference','png','reference.png'],['preview','png','render.png'],
] as const)await addFile(pack,role,format,source+'/'+path);
// Publish the exact runtime-resolution textures; 4K masters remain in Blender.
const glb=await readFile(source+'/model.glb'),jsonLength=glb.readUInt32LE(12);
const document=JSON.parse(glb.subarray(20,20+jsonLength).toString()),material=document.materials[0];
function textureBytes(index:number):Buffer {
 const image=document.images[document.textures[index].source],view=document.bufferViews[image.bufferView];
 const start=28+jsonLength+(view.byteOffset??0);return glb.subarray(start,start+view.byteLength);
}
const albedo=textureBytes(material.pbrMetallicRoughness.baseColorTexture.index);
addBytes(pack,'albedo','png',await sharp(albedo).png().toBuffer());
addBytes(pack,'team_mask','png',await sharp(albedo).extractChannel('alpha').png().toBuffer());
addBytes(pack,'normal','png',await sharp(textureBytes(material.normalTexture.index)).png().toBuffer());
addBytes(pack,'roughness','png',await sharp(textureBytes(material.pbrMetallicRoughness.metallicRoughnessTexture.index)).extractChannel(1).png().toBuffer());
addBytes(pack,'image','png',await sharp(source+'/render.png').resize(128,128,{fit:'contain',background:'#000000'}).png().toBuffer());
addBytes(pack,'generation','json',Buffer.from(JSON.stringify({
 ...JSON.parse(await readFile(source+'/provenance.json','utf8')),
 rebuild:'python prepare_texture.py; node experiments/building-studio/launch.mjs build acorn-hall-tripo',
 config:JSON.parse(await readFile(source+'/asset.json','utf8')),
 adapter:await readFile(source+'/model.py','utf8'),maskAdapter:await readFile(source+'/prepare_texture.py','utf8'),
},null,2)));
pack.definition.tags=['original','ants','main-building','tripo','team-mask'];
pack.definition.bindings={faction:'ants',profile:'building',render:[
 ...['asset.ants.fort','asset.ants.great-mound'].map(renderId=>({id:renderId,geometry:{asset:id,role:'geometry' as const,index:1},scale:1,healthHeight:9.7})),
 ...['icon.ants.fort','icon.ants.great-mound'].map(renderId=>({id:renderId,image:{asset:id,role:'image' as const,index:1}})),
],scenery:[]};
pack.definition.capabilities={teamColor:{mode:'mask',slots:['TC_TeamColor'],mask:{role:'team_mask',index:1}},blocker:{shape:'box',size:[15,15],offset:[0,0]},groundContact:{mode:'pivot'},vegetationClearance:7.5};
pack.definition.materials=[{slot:'TC_TeamColor',shader:'standard',color:'#ffffff',roughness:.72,metalness:0,alphaMode:'opaque',alphaCutoff:.4,doubleSided:true,
 textures:{albedo:{role:'albedo',index:1},normal:{role:'normal',index:1},roughness:{role:'roughness',index:1},teamMask:{role:'team_mask',index:1}}}];
await publishOriginals([pack],(index,changed)=>{
 const owned=new Set(pack.definition.bindings.render.map(r=>r.id));
 for(const a of index.values())if(a.id!==id&&a.bindings.render.some(r=>owned.has(r.id))){a.bindings.render=a.bindings.render.filter(r=>!owned.has(r.id));a.revision++;changed.add(a.id);}
});
