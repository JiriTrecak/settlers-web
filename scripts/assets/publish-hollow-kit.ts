/** Publish validated hollow-tree masters and their reusable material sources. */
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {recordSchema} from '../../tooling/asset-studio/shared/schema';
const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
function publish(raw:unknown){
 const record=recordSchema.parse(raw),folder=`art/records/${record.id}`,path=`${folder}/asset.json`;
 if(existsSync(path)){const old=JSON.parse(readFileSync(path,'utf8'));record.revision=old.revision+(JSON.stringify(old.outputs)!==JSON.stringify(record.outputs)||old.source?.sha256!==record.source?.sha256||JSON.stringify(old.scenery)!==JSON.stringify(record.scenery)?1:0);}
 mkdirSync(folder,{recursive:true});writeFileSync(path,JSON.stringify(record,null,2)+'\n');console.log(record.id);
}
for(const slug of ['hollow-bark','heartwood-grain','heartwood-rings']){
 const file=`assets/textures/terrain/${slug}.png`,source=`art/sources/textures/${slug}/source.png`;
 publish({version:1,id:`asset.textures.terrain.${slug}`,name:slug.replaceAll('-',' '),kind:'texture',tags:['canopy','heartwood'],status:'published',revision:1,profile:'texture',outputs:[{role:'data',path:file,sha256:hash(file),bytes:readFileSync(file).length,width:1024,height:1024}],render:[],scenery:[],source:{path:source,sha256:hash(source),quality:'master'},origin:{method:'openai'},validation:{checkedAt:new Date().toISOString(),warnings:[slug==='heartwood-rings'?'Unique planar end-grain texture, not intended to tile.':'Generated albedo; exact pixel edge tiling has not been verified.']}});
}
const slug='hollow-stump-gate',source=`art/sources/environment/${slug}`,runtime=`assets/models/environment/structures/${slug}`;
mkdirSync(runtime,{recursive:true});copyFileSync(`${source}/model.glb`,`${runtime}/model.glb`);
const bytes=readFileSync(`${runtime}/model.glb`),gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
const primitives=gltf.meshes.flatMap((m:{primitives:unknown[]})=>m.primitives),triangles=primitives.reduce((n:number,p:{indices:number})=>n+gltf.accessors[p.indices].count/3,0);
const blockers=[];
for(let i=0;i<36;i++){const a=i*Math.PI*2/36;if(Math.sin(a)<-.6&&Math.abs(Math.cos(a))<.6)continue;blockers.push({x:8.2*Math.cos(a),z:-8.2*Math.sin(a),width:1.6,depth:3,yaw:Math.PI/2+a});}
for(let i=0;i<13;i++){const a=i*Math.PI*2/13;if(Math.sin(a)<-.6&&Math.abs(Math.cos(a))<.65)continue;blockers.push({x:11*Math.cos(a),z:-11*Math.sin(a),width:2,depth:6,yaw:Math.PI/2+a,shape:'ellipse'});}
publish({version:1,id:`asset.models.environment.structures.${slug}`,name:'Hollow Stump Gate',kind:'model',tags:['canopy','hollow-tree','mission-entrance','permanent-obstacle'],status:'published',revision:1,profile:'model',outputs:[{role:'model',path:`${runtime}/model.glb`,sha256:hash(`${runtime}/model.glb`),bytes:bytes.length,triangles,primitives:primitives.length}],render:[],scenery:[{id:slug,name:'Hollow Stump Gate',type:'prop',category:'landmark',file:`models/environment/structures/${slug}/model.glb`,blockers,light:{x:0,y:4,z:5,color:'#ffb357',intensity:5,range:16}}],source:{path:`${source}/${slug}.blend`,sha256:hash(`${source}/${slug}.blend`),quality:'master'},origin:{method:'import'},validation:{checkedAt:new Date().toISOString(),warnings:['Static open hollow with inferred rear; roots assume locally flat terrain.','Root skirts and bark plates are open decorative surfaces; structural shell is two-sided geometry.','Mission placement and final surrounding foliage remain to be authored.']}});
console.log({triangles,primitives:primitives.length,bytes:bytes.length,blockers:blockers.length});
