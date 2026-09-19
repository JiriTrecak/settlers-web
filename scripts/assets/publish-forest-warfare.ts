/** Publish the editable forest-warfare masters through the game's asset registry.
 * Existing binding IDs are retained so authored missions use the same roster.
 * The sources and old art remain independent; this only updates published files.
 */
import {readFileSync,writeFileSync,copyFileSync,mkdirSync,existsSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {recordSchema} from '../../tooling/asset-studio/shared/schema';
import {records,writeManifest} from '../../tooling/asset-studio/server/manifest';

const sha=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
const buildings=[
 ['rootbound-hall','mound',5.8],['great-mound','great-mound',7],
 ['house','house',3.5],['player-barracks','barracks',4.7],
 ['tower','watchtower',8.3],['amber-sanctuary','sanctuary',4.9],
 ['ironroot-forge','ironroot-forge',4.6],['rootworks','rootworks',3.7],
 ['bombardier-workshop','bombardier-workshop',4.7],['forester','forester',3.2],
] as const;
const units=[['worker','base'],['warrior','warrior'],['archer','archer'],['hunter','hunter'],['bombardier','bombardier'],['marshal','marshal']] as const;
const entries=[
 ...buildings.map(([slug,kind,height])=>({id:`asset.models.buildings.ants.${slug}`,kit:`buildings/canopy-${kind}`,file:'model',blend:`canopy-${kind}`,height})),
 ...units.map(([slug,role])=>({id:`asset.models.units.ants.${slug}`,kit:'characters/canopy-ant-company',file:role,blend:'canopy-ant-company',height:role==='marshal'?2.8:role==='hunter'?2.7:2.3})),
];
for(const e of entries){
 const path=`art/records/${e.id}/asset.json`,previous=recordSchema.parse(JSON.parse(readFileSync(path,'utf8')));
 const input=`art/sources/${e.kit}/${e.file}.glb`,source=`art/sources/${e.kit}/${e.blend}.blend`;
 const bytes=readFileSync(input),doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
 const materials=doc.materials as {name:string}[];
 if(!materials.some(m=>m.name==='TC_TeamColor'))throw new Error(`${input}: missing ownership material`);
 const triangles=doc.meshes.reduce((sum:number,m:{primitives:{indices:number}[]})=>sum+m.primitives.reduce((n,p)=>n+doc.accessors[p.indices].count/3,0),0);
 const primitives=doc.meshes.reduce((n:number,m:{primitives:unknown[]})=>n+m.primitives.length,0);
 if(e.kit.startsWith('characters')&&(!doc.skins?.length||!doc.animations?.some((a:{name:string})=>a.name==='carry_run')))throw new Error(`${input}: missing rig/carry locomotion`);
 const output=previous.outputs.find(o=>o.role==='model')!;
 copyFileSync(input,output.path);
 const hash=sha(output.path);
 const record=recordSchema.parse({...previous,
  name:previous.name.replace('Ant colony · ','').replace(/^Base$/,'Worker'),
  tags:[...new Set([...previous.tags.filter(t=>t!=='migrated'),'forest-warfare','natural-materials'])],
  revision:previous.revision+(output.sha256!==hash?1:0),
  outputs:[{role:'model',path:output.path,sha256:hash,bytes:bytes.length,triangles,primitives}],
  render:previous.render.map(r=>({...r,healthHeight:e.height,...(r.character==='marshal'?{scale:1.25}:{}),...(r.id==='asset.ants.tower'?{scale:1}:{} )})),
  source:{path:source,sha256:sha(source),quality:e.kit.startsWith('characters')?'shared':'master'},
  origin:{method:'import'},
  validation:{checkedAt:new Date().toISOString(),warnings:['Hidden sides inferred from the approved forest-warfare concept; final in-game art review tracked separately.']},
 });
 writeFileSync(path,JSON.stringify(record,null,2)+'\n');
 console.log(`${record.name}: ${triangles} triangles, ${primitives} primitives`);
}
// Neutral scenery deliberately has no ownership material. Keep the existing
// resource bindings, and give decorative additions their own catalogue IDs.
const sceneryEntries=[
 ['environment.trees.tree-primary','tree-primary','tree_primary','foliage'],
 ['environment.trees.tree-secondary','tree-secondary','tree_secondary','foliage'],
 ['environment.trees.ancient-canopy-trunk','ancient-tree','ancient-canopy-trunk','landmark'],
 ['buildings.neutral.amber-seam','amber-outcrop','amber-seam','resource'],
 ['buildings.neutral.corrupted-root','corrupted-root','canopy-corrupted-root','resource'],
 ['environment.mushrooms.ochre-mushroom-colony','mushroom-cluster','ochre-mushroom-colony','foliage'],
 ['environment.mushrooms.canopy-tiny-mushrooms','tiny-mushrooms','canopy-tiny-mushrooms','foliage'],
 ['environment.ground.canopy-twig-log','twig-log','canopy-twig-log','terrain'],
 ['environment.structures.pebbles-pale','pebble-cluster','pebbles-pale','terrain'],
 ['environment.ground.canopy-forest-leaves','forest-leaves','canopy-forest-leaves','foliage'],
 ['environment.grass.canopy-short-grass','short-grass','canopy-short-grass','foliage'],
] as const;
for(const [slug,kind,sceneryId,category] of sceneryEntries){
 const id=`asset.models.${slug}`,path=`art/records/${id}/asset.json`;
 const previous=existsSync(path)?recordSchema.parse(JSON.parse(readFileSync(path,'utf8'))):undefined;
 const sourceRoot=`art/sources/environment/canopy-${kind}`,input=`${sourceRoot}/model.glb`,source=`${sourceRoot}/canopy-${kind}.blend`;
 const bytes=readFileSync(input),doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
 if(doc.materials?.some((m:{name:string})=>m.name==='TC_TeamColor'))throw new Error(`${input}: neutral scenery has ownership material`);
 if(kind.startsWith('tree-'))for(const [name,duration] of [['hit',.6],['fall',1.8],['decay',6]] as const){
  const clip=doc.animations?.find((a:{name:string})=>a.name===name);
  if(!clip||Math.abs(doc.accessors[clip.samplers[0].input].max[0]-duration)>1e-5)throw new Error(`${input}: wrong ${name} duration`);
 }
 const triangles=doc.meshes.reduce((sum:number,m:{primitives:{indices:number}[]})=>sum+m.primitives.reduce((n,p)=>n+doc.accessors[p.indices].count/3,0),0);
 const primitives=doc.meshes.reduce((n:number,m:{primitives:unknown[]})=>n+m.primitives.length,0);
 const output=previous?.outputs.find(o=>o.role==='model')?.path??`assets/models/${slug.replaceAll('.','/')}/model.glb`;
 mkdirSync(dirname(output),{recursive:true});copyFileSync(input,output);
 const hash=sha(output),name=kind.split('-').map(s=>s[0].toUpperCase()+s.slice(1)).join(' ');
 const record=recordSchema.parse({
  version:1,id,name,kind:'model',tags:['forest-warfare','natural-materials','forest-floor'],status:'published',revision:(previous?.revision??0)+(previous?.outputs[0].sha256!==hash?1:0),profile:'model',
  outputs:[{role:'model',path:output,sha256:hash,bytes:bytes.length,triangles,primitives}],
  render:previous?.render??[],
  scenery:previous?.scenery.length?previous.scenery:[{id:sceneryId,name,category,type:category==='terrain'?'ground':'prop',file:output.replace(/^assets\//,'')}],
  source:{path:source,sha256:sha(source),quality:'master'},origin:{method:'import'},
  validation:{checkedAt:new Date().toISOString(),warnings:kind==='ancient-tree'?['Boundary trunk: crown intentionally above the gameplay camera; flat-ground buttress roots.']:['Flat-ground contact; match terrain placement when dressing slopes.']},
 });
 mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(record,null,2)+'\n');
 console.log(`${name}: ${triangles} triangles, ${primitives} primitives`);
}
await writeManifest(process.cwd(),await records(process.cwd()));
