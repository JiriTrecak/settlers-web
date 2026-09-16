/** Publish the crossing masters using the exact floor profiles used to model them. */
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {recordSchema} from '../../tooling/asset-studio/shared/schema';
const hash=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
for(const slug of ['arched-root-walkway','woodland-timber-bridge','moss-stone-bridge']){
 const source=`art/sources/environment/${slug}`,runtime=`assets/models/environment/structures/${slug}`;
 const config=JSON.parse(readFileSync(`${source}/asset.json`,'utf8'));
 mkdirSync(runtime,{recursive:true});copyFileSync(`${source}/model.glb`,`${runtime}/model.glb`);
 const bytes=readFileSync(`${runtime}/model.glb`),gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
 const primitives=gltf.meshes.flatMap((m:{primitives:unknown[]})=>m.primitives);
 const triangles=primitives.reduce((n:number,p:{indices:number})=>n+gltf.accessors[p.indices].count/3,0);
 // The arch itself has a solid slab, not a ground rectangle. Only structural
 // feet outside the walk lane obstruct the lower floor.
 const blockers=slug==='moss-stone-bridge'?[-1,1].flatMap(side=>[-1,1].map(end=>({x:side*4,z:end*8.5,width:1.5,depth:2.3}))):
  slug==='woodland-timber-bridge'?[-1,1].flatMap(side=>[-1,0,1].map(end=>({x:side*3.35,z:end*8.5,width:.45,depth:.45}))):[];
 const record=recordSchema.parse({version:1,id:`asset.models.environment.structures.${slug}`,name:config.name,kind:'model',tags:['canopy','crossing','walkable'],status:'published',revision:1,profile:'model',outputs:[{role:'model',path:`${runtime}/model.glb`,sha256:hash(`${runtime}/model.glb`),bytes:bytes.length,triangles,primitives:primitives.length}],render:[],scenery:[{id:slug,name:config.name,type:'span',category:'landmark',file:`models/environment/structures/${slug}/model.glb`,deck:config.deck,...(blockers.length?{blockers}:{})}],source:{path:`${source}/${slug}.blend`,sha256:hash(`${source}/${slug}.blend`),quality:'master'},origin:{method:'import'},validation:{checkedAt:new Date().toISOString(),warnings:['Landings require authored matching bank heights; decorative supports may extend into the bank.','Navigation uses a continuous floor; small paving and plank gaps are cosmetic.']}});
 const folder=`art/records/${record.id}`,path=`${folder}/asset.json`;
 if(existsSync(path)){const old=JSON.parse(readFileSync(path,'utf8'));record.revision=old.revision+(JSON.stringify(old.outputs)!==JSON.stringify(record.outputs)||JSON.stringify(old.scenery)!==JSON.stringify(record.scenery)||old.source?.sha256!==record.source?.sha256?1:0);}
 mkdirSync(folder,{recursive:true});writeFileSync(path,JSON.stringify(record,null,2)+'\n');
 console.log({slug,triangles,primitives:primitives.length,bytes:bytes.length});
}
