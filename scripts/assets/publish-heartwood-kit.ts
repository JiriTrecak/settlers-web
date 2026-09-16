import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {recordSchema} from '../../tooling/asset-studio/shared/schema';
const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const pieces=[
 {slug:'heartwood-wall',folder:'structures',behavior:{blocker:{width:16,depth:4}}},
 {slug:'amber-resin-sconce',folder:'structures',behavior:{light:{x:1.2,y:4.2,z:1,color:'#ffb347',intensity:24,range:18}}},
 {slug:'heartwood-resin-font',folder:'structures',behavior:{blocker:{width:6.6,depth:5.2,shape:'ellipse'},light:{x:0,y:1.8,z:0,color:'#ffc064',intensity:20,range:14}}},
 {slug:'lanterncap-grove',folder:'mushrooms',behavior:{blocker:{width:10.5,depth:8.5,shape:'ellipse'},light:{x:0,y:3.2,z:0,color:'#a7cfbf',intensity:14,range:14}}},
 {slug:'bitter-heart',folder:'structures',behavior:{blocker:{width:14.2,depth:10.5,shape:'ellipse'},light:{x:0,y:4,z:1,color:'#ed713f',intensity:45,range:24}}},
];
for(const {slug,folder:category,behavior} of pieces){
 const source=`art/sources/environment/${slug}`,runtime=`assets/models/environment/${category}/${slug}`;
 mkdirSync(runtime,{recursive:true});copyFileSync(`${source}/model.glb`,`${runtime}/model.glb`);
 const config=JSON.parse(readFileSync(`${source}/asset.json`,'utf8')),bytes=readFileSync(`${runtime}/model.glb`),gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
 const primitives=gltf.meshes.flatMap((m:{primitives:unknown[]})=>m.primitives),triangles=primitives.reduce((n:number,p:{indices:number})=>n+gltf.accessors[p.indices].count/3,0);
 const record=recordSchema.parse({version:1,id:`asset.models.environment.${category}.${slug}`,name:config.name,kind:'model',tags:['heartwood','interior'],status:'published',revision:1,profile:'model',outputs:[{role:'model',path:`${runtime}/model.glb`,sha256:hash(`${runtime}/model.glb`),bytes:bytes.length,triangles,primitives:primitives.length}],render:[],scenery:[{id:slug,name:config.name,type:'prop',category:'landmark',file:`models/environment/${category}/${slug}/model.glb`,...behavior}],source:{path:`${source}/${slug}.blend`,sha256:hash(`${source}/${slug}.blend`),quality:'master'},origin:{method:'import'},validation:{checkedAt:new Date().toISOString(),warnings:['Modular interpretation of the Heartwood Vault concept; rear faces inferred.','Static geometry. Local lights share the renderer’s four-nearest-light budget.']}});
 const folder=`art/records/${record.id}`,path=`${folder}/asset.json`;if(existsSync(path)){const old=JSON.parse(readFileSync(path,'utf8'));record.revision=old.revision+(JSON.stringify(old.outputs)!==JSON.stringify(record.outputs)||JSON.stringify(old.scenery)!==JSON.stringify(record.scenery)||old.source?.sha256!==record.source.sha256?1:0);}
 mkdirSync(folder,{recursive:true});writeFileSync(path,JSON.stringify(record,null,2)+'\n');console.log({slug,triangles,primitives:primitives.length,bytes:bytes.length});
}
