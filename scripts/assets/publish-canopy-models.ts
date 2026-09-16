/** Publish the validated editable environment masters with reproducible runtime metadata. */
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {recordSchema} from '../../tooling/asset-studio/shared/schema';
const hash=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
for(const [slug,folder,blocker] of [
 ['ancient-canopy-trunk','trees',{width:14,depth:14,shape:'ellipse'}],
 ['fallen-canopy-bough','structures',{width:16,depth:2.8}],
 ['fern-thicket','shrubs',null],
 ['bramble-thicket','shrubs',null],
 ['ochre-mushroom-colony','mushrooms',null],
 ['mossy-boulder-bank','rocks',{width:9.5,depth:6,shape:'ellipse'}],
 ['curled-forest-leaf','ground',null],
 ['forest-splinter-pile','ground',null],
 ['interwoven-root-bank','structures',{width:12,depth:3}],
 ['fallen-acorn','ground',null],
] as const){
 const source=`art/sources/environment/${slug}`,runtime=`assets/models/environment/${folder}/${slug}`;
 mkdirSync(runtime,{recursive:true});copyFileSync(`${source}/model.glb`,`${runtime}/model.glb`);
 const data=readFileSync(`${runtime}/model.glb`);if(data.readUInt32LE(0)!==0x46546c67)throw Error('Invalid GLB');
 const gltf=JSON.parse(data.subarray(20,20+data.readUInt32LE(12)).toString());
 const primitives=gltf.meshes.flatMap((m:{primitives:unknown[]})=>m.primitives);
 const triangles=primitives.reduce((sum:number,p:{indices:number})=>sum+gltf.accessors[p.indices].count/3,0);
 const id=`asset.models.environment.${folder}.${slug}`,name=slug.replaceAll('-',' ').replace(/\b\w/g,c=>c.toUpperCase());
 const recordPath=`art/records/${id}/asset.json`,previous=existsSync(recordPath)?JSON.parse(readFileSync(recordPath,'utf8')):null;
 const record=recordSchema.parse({version:1,id,name,kind:'model',tags:['canopy','forest-floor',blocker?'permanent-obstacle':'ground-detail'],status:'published',revision:1,profile:'model',outputs:[{role:'model',path:`${runtime}/model.glb`,sha256:hash(`${runtime}/model.glb`),bytes:data.length,triangles,primitives:primitives.length}],render:[],scenery:[{id:slug,name,type:'prop',category:blocker?'landmark':'foliage',file:`models/environment/${folder}/${slug}/model.glb`,...(blocker?{blocker}:{})}],source:{path:`${source}/${slug}.blend`,sha256:hash(`${source}/${slug}.blend`),quality:'master'},origin:{method:'import'},validation:{checkedAt:new Date().toISOString(),warnings:slug==='ancient-canopy-trunk'?['Trunk base only; crown remains above gameplay camera. Flat-ground root contact.']:['Static environment model; flat-ground contact.']}});
 if(previous){const changed=JSON.stringify(previous.outputs)!==JSON.stringify(record.outputs)||previous.source?.sha256!==record.source?.sha256||JSON.stringify(previous.scenery)!==JSON.stringify(record.scenery);record.revision=previous.revision+(changed?1:0);}
 mkdirSync(`art/records/${id}`,{recursive:true});writeFileSync(`art/records/${id}/asset.json`,JSON.stringify(record,null,2)+'\n');console.log({id,triangles,primitives:primitives.length,bytes:data.length});
}
