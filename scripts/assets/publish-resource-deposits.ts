/** Publish the two new deposits and four independent amber depletion visuals.
 * Run: node --import tsx scripts/assets/publish-resource-deposits.ts
 * Every upload goes through the asset studio's AuthoringStore and publication.
 */
import {readFile} from 'node:fs/promises';
import {AuthoringStore} from '../../tooling/asset-studio/server/authoring/store';
import type {AssetDefinition,FileRole} from '../../src/shared/authoring/asset';

const store=new AuthoringStore(process.cwd());
const entries=[
 {slug:'amber-deposit',name:'Amber Deposit',asset:'asset.resource.amber-seam',uuid:'e7f04aa1-0e59-4bb3-9d49-150d1d44e02f',triangles:8811,sourceIndex:13,healthHeight:3.8},
 {slug:'amber-deposit-one-third',name:'Amber Deposit — One Third Mined',asset:'asset.resource.amber-seam-one-third',uuid:'5d4fee27-3ed2-4a57-928a-50f177c2945e',triangles:8744,sourceIndex:2,healthHeight:3.5},
 {slug:'amber-deposit-two-thirds',name:'Amber Deposit — Two Thirds Mined',asset:'asset.resource.amber-seam-two-thirds',uuid:'5ad762d3-8ef0-4803-bb9e-161bc3477e8b',triangles:8696,sourceIndex:2,healthHeight:1.9},
 {slug:'amber-deposit-empty',name:'Amber Deposit — Exhausted',asset:'asset.resource.amber-seam-empty',uuid:null,triangles:3162,sourceIndex:2,healthHeight:0.55},
 {slug:'corrupted-root',name:'Corrupted Root Deposit',asset:'asset.resource.corrupted-root',uuid:'3a27fb4f-d2a1-4114-ad64-76d89c49eb84',triangles:8896,sourceIndex:3,healthHeight:3.8},
] as const;
const only=process.argv[2];

async function upload(id:string,role:FileRole,format:string,bytes:Buffer,index=1){
 await store.dispatch({op:'asset.upload',id,expectedRevision:(await store.get(id)).revision,role,index,format,base64:bytes.toString('base64')});
}
for(const entry of entries){
 if(only&&entry.slug!==only)continue;
 const id='asset.models.resources.'+entry.slug;
 const dir=`.asset-work/build/resources/${entry.slug}-v2`;
 let a:AssetDefinition;
 try{a=await store.get(id);}catch{
  a=await store.dispatch({op:'asset.create',definition:{version:1,id,name:entry.name,kind:'prop',revision:1,status:'draft',tags:[],resources:[],usesGeometry:false,
   transform:{scale:1,pivot:[0,0,0],up:'Y',forward:'+Z'},materials:[],bindings:{profile:'model',render:[],scenery:[]},capabilities:{},
   provenance:{method:'generated',licenseNote:'Original artwork created for Under the Canopy.'}}}) as AssetDefinition;
 }
 const recipe=entry.slug==='amber-deposit-empty'?'scripts/assets/build-empty-amber-deposit.py':'scripts/assets/build-resource-deposit.py';
 const files:Record<string,{asset:string,role:FileRole,index:number}>={};
 async function put(file:string,role:FileRole,format:string,index=1,name=file){
  await upload(id,role,format,await readFile(`${dir}/${file}`),index);
  files[name]={asset:id,role,index};
 }
 await put('model.glb','geometry','glb');
 await put('source.blend','source','blend');
 await put('render.png','preview','png');
 await put('reference.png','reference','png');
 if(entry.uuid)await put('source.glb','source','glb',entry.sourceIndex);
 else await put('soil-albedo.png','source','png',entry.sourceIndex);
 await upload(id,'recipe','py',await readFile(recipe));files['model.py']={asset:id,role:'recipe',index:1};
 const generation={method:entry.uuid?'Tripo H3.1 Best Quality, UltraMesh, PBR 4K':'Blender authored + ImageGen soil albedo',
  tripoTask:entry.uuid,triangleCount:entry.triangles,runtimeTextureSize:entry.uuid?1024:1024,
  reference:'reference.png',recipe,description:'Four amber stages are separate textured geometry; the renderer selects by remaining yield.'};
 await upload(id,'generation','json',Buffer.from(JSON.stringify(generation,null,2)+'\n'));
 const build={version:1,category:'resources',slug:entry.slug,entry:'model.py',files};
 await upload(id,'build','json',Buffer.from(JSON.stringify(build,null,2)+'\n'));
 a=await store.get(id);
 const render=entry.slug==='amber-deposit'?
  a.bindings.render.map(binding=>'geometry' in binding?{...binding,scale:2,healthHeight:entry.healthHeight*2}:binding): 
  [{id:entry.asset,scale:2,healthHeight:entry.healthHeight*2,
    geometry:{role:'geometry' as const,index:1,asset:id}}];
 await store.dispatch({op:'asset.save',expectedRevision:a.revision,definition:{...a,name:entry.name,
  tags:['original','neutral','woodland','resource',...(entry.uuid?['tripo']:['authored'])],
  materials:[],bindings:{...a.bindings,render},
  capabilities:{...a.capabilities,groundContact:{mode:'pivot'},blocker:{shape:'box',size:[15,15],offset:[0,0]},vegetationClearance:7.5},
  provenance:{method:'generated',licenseNote:'Original artwork created for Under the Canopy.',generation:{role:'generation',index:1}}}});
 await store.dispatch({op:'asset.validate',id});
 const published=await store.dispatch({op:'asset.publish',id,expectedRevision:(await store.get(id)).revision}) as AssetDefinition;
 console.log('Published',id,'revision',published.revision,'triangles',entry.triangles);
}
