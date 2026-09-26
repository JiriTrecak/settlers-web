/** Publish the original, procedural ant command hall; preserve gameplay IDs and behavior. */
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {originalPackage,addBytes,addFile,publishOriginals} from './original-publication';
const source='art/sources/buildings/mandible-hall';
const id='asset.models.buildings.ants-mandible-hall';
const pack=originalPackage(id,'Mandible Hall','building','generated');
await addFile(pack,'geometry','glb',source+'/model.glb');
await addFile(pack,'source','blend',source+'/mandible-hall.blend');
await addFile(pack,'reference','png',source+'/reference.png');
await addFile(pack,'preview','png',source+'/render.png');
addBytes(pack,'image','png',await sharp(source+'/render.png').resize(128,128).png().toBuffer());
for(const [i,name]of ['wood','dome','leaf','chitin','team'].entries())await addFile(pack,'albedo','png',source+'/'+name+'.png',i+1);
for(const [i,name]of ['wood','dome'].entries())await addFile(pack,'normal','png',source+'/'+name+'-normal.png',i+1);
addBytes(pack,'generation','json',Buffer.from(JSON.stringify({
 tool:'Blender bpy',seed:72,recipe:'scripts stored in source.blend Text datablocks',
 rebuild:'node experiments/building-studio/launch.mjs build mandible-hall',
 config:JSON.parse(await readFile(source+'/asset.json','utf8')),
 python:await readFile(source+'/model.py','utf8'),texturesPython:await readFile(source+'/textures.py','utf8'),
 constraints:{linkedIdenticalTowers:4,mirroredEntranceMandibles:true,groundPlane:false,metal:false,ropes:false},
},null,2)));
pack.definition.tags=['original','ants','main-building','procedural'];
pack.definition.bindings={faction:'ants',profile:'building',render:[
 {id:'asset.ants.fort',geometry:{asset:id,role:'geometry',index:1},scale:1,healthHeight:8.9},
 {id:'asset.ants.great-mound',geometry:{asset:id,role:'geometry',index:1},scale:1,healthHeight:8.9},
 {id:'icon.ants.fort',image:{asset:id,role:'image',index:1}},
 {id:'icon.ants.great-mound',image:{asset:id,role:'image',index:1}},
],scenery:[]};
pack.definition.capabilities={teamColor:{mode:'material',slots:['TC_TeamColor']},blocker:{shape:'box',size:[9,9],offset:[0,0]},groundContact:{mode:'pivot'},vegetationClearance:4.5};
pack.definition.materials=[
 {slot:'Wood_Dark',texture:1,normal:1},{slot:'Wood_Light_Dome',texture:2,normal:2},
 {slot:'Leaf_Green',texture:3},{slot:'Chitin_Red',texture:4},{slot:'TC_TeamColor',texture:5},
].map(m=>({slot:m.slot,shader:'standard',color:m.slot==='TC_TeamColor'?'#cc4a2e':'#ffffff',roughness:m.slot==='Chitin_Red'?.28:.65,metalness:0,alphaMode:'opaque',alphaCutoff:.4,doubleSided:false,
 textures:{albedo:{role:'albedo',index:m.texture},...(m.normal?{normal:{role:'normal' as const,index:m.normal}}:{})}}));
await publishOriginals([pack],(index,changed)=>{
 const owned=new Set(pack.definition.bindings.render.map(r=>r.id));
 for(const a of index.values())if(a.id!==id&&a.bindings.render.some(r=>owned.has(r.id))){a.bindings.render=a.bindings.render.filter(r=>!owned.has(r.id));a.revision++;changed.add(a.id);}
});
