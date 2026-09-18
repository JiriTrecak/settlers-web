/** Publish deterministic Blender exports through the ordinary asset registry. */
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
import {recordSchema} from '../../tooling/asset-studio/shared/schema';
import {records,writeManifest} from '../../tooling/asset-studio/server/manifest';
const sha=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const entries=[
 ...['leaf-ledger','vigor-seed','family-ring','healing-draught','mana-draught','healing-scroll'].map(slug=>({slug,name:slug.split('-').map(s=>s[0].toUpperCase()+s.slice(1)).join(' '),group:'items/briarwatch',kit:'items/briarwatch-rewards',blend:'briarwatch-rewards',file:slug,binding:slug,height:1})),
 {slug:'watch-bivouac',name:'Watch Bivouac',group:'environment/briarwatch',kit:'buildings/briarwatch-village-kit',blend:'briarwatch-village-kit',file:'watch-bivouac',binding:'watch-bivouac',height:2.5},
 {slug:'ruined-cottage',name:'Ruined Cottage',group:'buildings/neutral',kit:'buildings/briarwatch-village-kit',blend:'briarwatch-village-kit',file:'ruined-cottage',binding:'ruined-cottage',height:2},
 {slug:'bark-cottage',name:'Bark Cottage',group:'buildings/ants',kit:'buildings/briarwatch-village-kit',blend:'briarwatch-village-kit',file:'bark-cottage',binding:'cottage',height:5},
 {slug:'twig-cage',name:'Twig Cage',group:'buildings/neutral',kit:'buildings/briarwatch-village-kit',blend:'briarwatch-village-kit',file:'twig-cage',binding:'cage',height:3},
 {slug:'merchant-cart',name:'Merchant Cart',group:'environment/briarwatch',kit:'buildings/briarwatch-village-kit',blend:'briarwatch-village-kit',file:'merchant-cart',binding:'merchant-cart',height:3},
 {slug:'supply-crate',name:'Supply Crate',group:'buildings/neutral',kit:'buildings/briarwatch-village-kit',blend:'briarwatch-village-kit',file:'supply-crate',binding:'supply-crate',height:1.3},
 ...[['civilian','Briarwatch Villager',1],['warrior','Briar Raider',1],['archer','Briar Poacher',1],['captain','Briar Captain',1.4]].map(([role,name,scale])=>({slug:`briar-${role}`,name:String(name),group:'units/ants',kit:'characters/briarwatch-ant-cast',blend:'briarwatch-ant-cast',file:String(role),binding:String(role),height:2.3*Number(scale),character:String(role),scale:Number(scale)})),
];
for(const entry of entries){
 const input=`art/sources/${entry.kit}/${entry.file}.glb`,output=`assets/models/${entry.group}/${entry.slug}/model.glb`,source=`art/sources/${entry.kit}/${entry.blend}.blend`;
 const bytes=readFileSync(input),doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
 const triangles=doc.meshes.reduce((sum:number,m:{primitives:{indices:number}[]})=>sum+m.primitives.reduce((n,p)=>n+doc.accessors[p.indices].count/3,0),0);
 if('character' in entry&&(!doc.skins?.length||!doc.animations?.some((a:{name:string})=>a.name==='run')))throw new Error(`Missing rig/run: ${input}`);
 mkdirSync(dirname(output),{recursive:true});copyFileSync(input,output);
 const id=`asset.models.${entry.group.replaceAll('/','.')}.${entry.slug}`,path=`art/records/${id}/asset.json`;
 const previous=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):null;
 const record=recordSchema.parse({version:1,id,name:entry.name,kind:'model',tags:['briarwatch','campaign','original'],status:'published',revision:previous?previous.revision+(previous.outputs[0].sha256!==sha(output)?1:0):1,profile:'model',outputs:[{role:'model',path:output,sha256:sha(output),bytes:bytes.length,triangles,primitives:doc.meshes.reduce((n:number,m:{primitives:unknown[]})=>n+m.primitives.length,0)}],render:[{id:`asset.briar.${entry.binding}`,file:output,healthHeight:entry.height,...('character' in entry?{character:entry.character,scale:entry.scale,cameraAnchor:{height:1.5*entry.scale,forward:.15,distance:7}}:{})}],scenery:['merchant-cart','watch-bivouac'].includes(entry.slug)?[{id:`briarwatch-${entry.slug}`,name:entry.name,type:'prop',category:'landmark',file:output.slice(7),blocker:entry.slug==='merchant-cart'?{width:2.8,depth:4.2}:{width:4,depth:3.5}}]:[],source:{path:source,sha256:sha(source),quality:'shared'},origin:{method:'import'},validation:{checkedAt:new Date().toISOString(),warnings:['Campaign art pass in progress; final full-orbit and animation review pending.']}});
 mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(record,null,2)+'\n');console.log(`${entry.name}: ${triangles} triangles`);
}
await writeManifest(process.cwd(),await records(process.cwd()));
