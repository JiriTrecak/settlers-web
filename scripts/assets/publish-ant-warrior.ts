/** Publish the approved Tripo warrior; retain the existing simulation definition. */
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {originalPackage,addBytes,addFile,publishOriginals} from './original-publication';
const source='art/sources/characters/ant-warrior-tripo',id='asset.models.units.ants-warrior';
const pack=originalPackage(id,'Ant Warrior','unit','generated');
const cfg=JSON.parse(await readFile(source+'/asset.json','utf8'));
await addFile(pack,'geometry','glb',source+'/warrior.glb');
await addFile(pack,'source','blend',source+'/ant-warrior-tripo.blend');
await addFile(pack,'reference','png',source+'/reference.png');
await addFile(pack,'preview','png',source+'/render.png');
addBytes(pack,'image','png',await sharp(source+'/render.png').resize(128,128).png().toBuffer());
const glb=await readFile(source+'/warrior.glb');
const gltf=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString());
const attack=gltf.animations.find((a:{name:string})=>a.name===cfg.characterVariants.warrior.states.attack);
const attackDuration=Math.max(...attack.samplers.map((s:{input:number})=>gltf.accessors[s.input].max[0]));
addBytes(pack,'generation','json',Buffer.from(JSON.stringify({tool:'Tripo Studio + Blender adapter',sourceTask:'65365d12-0a6e-4a56-809f-4d4bbceed95f',sourceDirectory:source,rebuild:'node experiments/building-studio/launch.mjs build ant-warrior-tripo --category characters',config:cfg,python:await readFile(source+'/model.py','utf8'),triangleBudget:5000},null,2)));
pack.definition.tags=['original','ants','warrior','skinned','acorn','tripo'];
pack.definition.provenance.licenseNote='Tripo-generated artwork from the supplied ant-warrior reference, adapted in Blender for Under the Canopy.';
pack.definition.bindings={faction:'ants',profile:'warrior',render:[
 {id:'asset.ants.warrior',geometry:{asset:id,role:'geometry',index:1},character:'warrior',scale:1,healthHeight:2.3},
 {id:'icon.ants.warrior',image:{asset:id,role:'image',index:1}},
],scenery:[]};
pack.definition.capabilities={teamColor:{mode:'material',slots:['TC_TeamColor']},groundContact:{mode:'pivot'},
 animations:Object.entries(cfg.characterVariants.warrior.states as Record<string,string>).map(([semantic,clip])=>({semantic,clip,loop:!['attack','hit','death'].includes(semantic),events:semantic==='attack'?[{name:'hit',time:attackDuration*cfg.attackEvents.warrior.normalizedTime}]:[]})),
 sockets:[{name:'left-hand',node:'socket_handL',offset:[0,0,0]},{name:'right-hand',node:'socket_handR',offset:[0,0,0]},{name:'blade-base',node:'socket_blade_base',offset:[0,0,0]},{name:'blade-tip',node:'socket_blade_tip',offset:[0,0,0]}],
};
await publishOriginals([pack],(index,changed)=>{
 const owned=new Set(pack.definition.bindings.render.map(r=>r.id));
 for(const a of index.values())if(a.id!==id&&a.bindings.render.some(r=>owned.has(r.id))){a.bindings.render=a.bindings.render.filter(r=>!owned.has(r.id));a.revision++;changed.add(a.id);}
});
