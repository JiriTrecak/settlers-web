/** Publish the seven reference-based amber shapes through the canonical asset store. */
import {readFile} from 'node:fs/promises';
import {AuthoringStore} from '../../tooling/asset-studio/server/authoring/store';
import type {AssetDefinition,FileRole} from '../../src/shared/authoring/asset';
const store=new AuthoringStore(process.cwd());
for(const suffix of ['1','2','3','4','5','low','empty']){
 const slug=`amber-crystal-${suffix}`,id=`asset.models.resources.${slug}`,dir=`.asset-work/build/resources/${slug}`;
 const name=suffix==='low'?'Amber Crystals — One Third Remaining':suffix==='empty'?'Amber Crystals — Empty':`Amber Crystals ${suffix}`;
 let asset:AssetDefinition;
 try{asset=await store.get(id);}catch{
  await store.dispatch({op:'asset.create',definition:{version:1,id,name,kind:'prop',revision:1,status:'draft',tags:[],resources:[],usesGeometry:false,
   transform:{scale:1,pivot:[0,0,0],up:'Y',forward:'+Z'},materials:[],bindings:{profile:'model',render:[],scenery:[]},capabilities:{},
   provenance:{method:'generated',licenseNote:'Original artwork created for Under the Canopy.'}}});
 }
 const files:Record<string,{asset:string;role:FileRole;index:number}>={};
 async function upload(role:FileRole,format:string,bytes:Buffer,index=1){
  await store.dispatch({op:'asset.upload',id,expectedRevision:(await store.get(id)).revision,role,index,format,base64:bytes.toString('base64')});
 }
 for(const [file,role,format,index] of [
  ['model.glb','geometry','glb',1],['source.blend','source','blend',1],['source.glb','source','glb',2],
  ['reference.png','reference','png',1],['render.png','preview','png',1],['rear.png','preview','png',2],
 ] as const){await upload(role,format,await readFile(`${dir}/${file}`),index);files[file]={asset:id,role,index};}
 await upload('recipe','py',await readFile('scripts/assets/build-amber-crystal.py'));files['model.py']={asset:id,role:'recipe',index:1};
 const stats=JSON.parse(await readFile(`${dir}/stats.json`,'utf8'));
 const config={name,recipe:'model.py',blend:'source.blend',preserve_textures:true,runtime_texture_size:1024,camera:{azimuth:42,elevation:35,target:[0,0,stats.dimensions[2]*.4],scale:11,distance:20},render:{width:1024,height:1024,samples:64}};
 await upload('source','json',Buffer.from(JSON.stringify(config,null,2)),3);files['asset.json']={asset:id,role:'source',index:3};
 const provenance=JSON.parse(await readFile(`${dir}/provenance.json`,'utf8'));
 await upload('generation','json',Buffer.from(JSON.stringify({...provenance,...stats,description:'Five full variants share one-third remaining and empty stages.'},null,2)+'\n'));
 await upload('build','json',Buffer.from(JSON.stringify({version:1,category:'resources',slug,entry:'model.py',files},null,2)+'\n'));
 asset=await store.get(id);
 await store.dispatch({op:'asset.save',expectedRevision:asset.revision,definition:{...asset,name,tags:['original','neutral','resource','amber','tripo'],materials:[],
  bindings:{profile:'model',render:[{id:`asset.resource.${slug}`,geometry:{asset:id,role:'geometry',index:1},scale:2,healthHeight:stats.dimensions[2]*2}],scenery:[]},
  capabilities:{groundContact:{mode:'pivot'},blocker:{shape:'box',size:[4,4],offset:[0,0]},vegetationClearance:2},
  provenance:{method:'generated',licenseNote:'Original artwork created for Under the Canopy.',generation:{role:'generation',index:1}}}});
 await store.dispatch({op:'asset.validate',id});
 await store.dispatch({op:'asset.publish',id,expectedRevision:(await store.get(id)).revision});
 console.log('Published',id,stats);
}
