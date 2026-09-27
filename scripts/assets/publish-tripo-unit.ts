/** Publish a reference-generated unit into its existing gameplay definition. */
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {originalPackage,addBytes,addFile,publishOriginals} from './original-publication';
const slug=process.argv[2];
if(!slug||!/^[a-z0-9-]+$/.test(slug))throw Error('Expected character source slug');
const source=`.asset-work/build/characters/${slug}`;
const cfg=JSON.parse(await readFile(source+'/asset.json','utf8')),spec=cfg.publication;
if(!spec?.id||!spec.renderId||!spec.profile)throw Error('Explicit existing-game publication bindings required');
const pack=originalPackage(spec.id,cfg.name,spec.kind??'unit','generated');
await addFile(pack,'geometry','glb',`${source}/${spec.profile}.glb`);
await addFile(pack,'source','blend',`${source}/${cfg.blend}`);
await addFile(pack,'reference','png',source+'/reference.png');
await addFile(pack,'preview','png',source+'/render.png');
addBytes(pack,'image','png',await sharp(source+'/render.png').resize(128,128).png().toBuffer());
const bytes=await readFile(`${source}/${spec.profile}.glb`),length=bytes.readUInt32LE(12);
const gltf=JSON.parse(bytes.subarray(20,20+length).toString());
const triangles=gltf.meshes.flatMap((m:any)=>m.primitives).reduce((n:number,p:any)=>n+gltf.accessors[p.indices].count/3,0);
const ownedMaterial=gltf.materials.find((m:any)=>m.name==='TC_TeamColor');
if(ownedMaterial?.extras?.teamColorMask==='baseColorAlpha'){
 const image=gltf.images[gltf.textures[ownedMaterial.pbrMetallicRoughness.baseColorTexture.index].source];
 const view=gltf.bufferViews[image.bufferView],start=28+length+(view.byteOffset??0);
 const atlas=bytes.subarray(start,start+view.byteLength);
 addBytes(pack,'albedo','png',await sharp(atlas).png().toBuffer());
 addBytes(pack,'team_mask','png',await sharp(atlas).extractChannel('alpha').png().toBuffer());
}
const states=cfg.characterVariants[spec.profile].states as Record<string,string>;
const event=cfg.attackEvents?.[spec.profile];
pack.definition.tags=['original',...(spec.faction?[spec.faction]:[]),'skinned','tripo',slug];
pack.definition.bindings={...(spec.faction?{faction:spec.faction}:{}),profile:spec.profile,render:[
 {id:spec.renderId,geometry:{asset:spec.id,role:'geometry',index:1},character:spec.profile,scale:1,healthHeight:spec.healthHeight,...(spec.projectile?{projectile:spec.projectile}:{}),...(spec.projectileSocket?{projectileSocket:spec.projectileSocket}:{})},
 {id:spec.iconId,image:{asset:spec.id,role:'image',index:1}},
],scenery:[]};
for(const id of spec.renderAliases??[])pack.definition.bindings.render.push({...pack.definition.bindings.render[0],id});
let maximumCargo=0;
for(const [i,kind]of (cfg.cargo??[]).entries()){
 const cargo=await readFile(`${source}/cargo-${kind}.glb`),n=cargo.readUInt32LE(12),doc=JSON.parse(cargo.subarray(20,20+n).toString());
 maximumCargo=Math.max(maximumCargo,doc.meshes.flatMap((m:any)=>m.primitives).reduce((s:number,p:any)=>s+doc.accessors[p.indices].count/3,0));
 addBytes(pack,'geometry','glb',cargo,i+2);
 pack.definition.bindings.render.push({id:`asset.item.${kind}`,geometry:{asset:spec.id,role:'geometry',index:i+2},scale:1});
}
if(triangles+maximumCargo>5000)throw Error(`Complete unit exceeds 5000 triangles: ${triangles}+${maximumCargo}`);
pack.definition.capabilities={...(ownedMaterial?{teamColor:ownedMaterial.extras?.teamColorMask==='baseColorAlpha'?{mode:'mask' as const,slots:['TC_TeamColor'],mask:{role:'team_mask' as const,index:1}}:{mode:'material' as const,slots:['TC_TeamColor']}}:{}),groundContact:{mode:'pivot'},
 animations:Object.entries(states).map(([semantic,clip])=>{
  const animation=gltf.animations.find((a:any)=>a.name===clip);if(!animation)throw Error(`Missing clip ${clip}`);
  const duration=Math.max(...animation.samplers.map((s:any)=>gltf.accessors[s.input].max[0]));
  return {semantic,clip,loop:!['attack','hit','death'].includes(semantic),events:semantic==='attack'&&event?[{name:event.event,time:duration*event.normalizedTime}]:[]};
 }),sockets:gltf.nodes.filter((n:any)=>n.name?.startsWith('socket_')).map((n:any)=>({name:n.name.slice(7),node:n.name,offset:[0,0,0]})),
};
addBytes(pack,'generation','json',Buffer.from(JSON.stringify({
 ...JSON.parse(await readFile(source+'/provenance.json','utf8')),sourceDirectory:source,config:cfg,triangles,maximumCargo,completeUnitTriangles:triangles+maximumCargo,
 adapter:await readFile(source+'/model.py','utf8'),triangleBudget:5000,
},null,2)));
await publishOriginals([pack],(index,changed)=>{
 const owned=new Set(pack.definition.bindings.render.map(r=>r.id));
 for(const a of index.values())if(a.id!==spec.id&&a.bindings.render.some(r=>owned.has(r.id))){a.bindings.render=a.bindings.render.filter(r=>!owned.has(r.id));a.revision++;changed.add(a.id);}
});
console.log('Complete unit triangles',triangles+maximumCargo);
