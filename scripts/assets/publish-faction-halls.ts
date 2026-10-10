/** Publish approved reference halls; editable role sources remain canonical. */
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {AuthoringStore} from '../../tooling/asset-studio/server/authoring/store';
import type {AssetDefinition,FileRole} from '../../src/shared/authoring/asset';
const store=new AuthoringStore(process.cwd());
for(const slug of ['ants-queensguard-hall','beetles-carapace-hall']){
 const faction=slug.startsWith('ants')?'ants':'beetles',short=slug.slice(faction.length+1);
 const id=`asset.models.buildings.${slug}`,dir=`.asset-work/build/buildings/${slug}`;
 const name=faction==='ants'?'Queensguard Hall':'Carapace Bastion';
 try{await store.get(id);}catch{
  await store.dispatch({op:'asset.create',definition:{version:1,id,name,kind:'building',revision:1,status:'draft',tags:[],resources:[],usesGeometry:false,
   transform:{scale:1,pivot:[0,0,0],up:'Y',forward:'+Z'},materials:[],bindings:{profile:'building',faction,render:[],scenery:[]},capabilities:{},
   provenance:{method:'generated',licenseNote:'Original artwork created for Under the Canopy.'}}});
 }
 const files:Record<string,{asset:string;role:FileRole;index:number}>={};
 async function upload(role:FileRole,format:string,bytes:Buffer,index=1){await store.dispatch({op:'asset.upload',id,expectedRevision:(await store.get(id)).revision,role,index,format,base64:bytes.toString('base64')});}
 for(const [file,role,format,index] of [
  ['model.glb','geometry','glb',1],['source.blend','source','blend',1],['source.glb','source','glb',2],
  ['albedo-team.png','source','png',3],['ownership.json','source','json',4],
  ['reference.png','reference','png',1],['render.png','preview','png',1],
  ['team-blue.png','preview','png',2],['team-green.png','preview','png',3],['team-white.png','preview','png',4],['rear.png','preview','png',5],
 ] as const){await upload(role,format,await readFile(`${dir}/${file}`),index);files[file]={asset:id,role,index};}
 await upload('recipe','py',await readFile('scripts/assets/build-faction-hall.py'));files['model.py']={asset:id,role:'recipe',index:1};
 await upload('recipe','py',await readFile('scripts/assets/prepare-hall-textures.py'),2);files['prepare_texture.py']={asset:id,role:'recipe',index:2};
 const stats=JSON.parse(await readFile(`${dir}/stats.json`,'utf8'));
 const config={name,recipe:'model.py',blend:'source.blend',preserve_textures:true,runtime_texture_size:2048,
  camera:{azimuth:36,elevation:35,target:[0,0,stats.dimensions[2]*.4],scale:25,distance:40},
  light:{key_energy:500,fill_energy:250,rim_energy:350,scale:2},render:{width:1200,height:1200,samples:64}};
 await upload('source','json',Buffer.from(JSON.stringify(config,null,2)),5);files['asset.json']={asset:id,role:'source',index:5};
 const provenance=JSON.parse(await readFile(`${dir}/provenance.json`,'utf8'));
 await upload('generation','json',Buffer.from(JSON.stringify({...provenance,...stats,description:'Square main hall; red reference regions are per-pixel team color. Natural materials retain authored colors.'},null,2)+'\n'));
 await upload('build','json',Buffer.from(JSON.stringify({version:1,category:'buildings',slug,entry:'model.py',files},null,2)+'\n'));
 // Expose the exact runtime-resolution texture and mask to the material editor.
 const bytes=await readFile(`${dir}/model.glb`),length=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+length).toString()),mat=gltf.materials[0];
 function texture(index:number){const image=gltf.images[gltf.textures[index].source],v=gltf.bufferViews[image.bufferView],start=28+length+(v.byteOffset??0);return bytes.subarray(start,start+v.byteLength);}
 const albedo=await sharp(texture(mat.pbrMetallicRoughness.baseColorTexture.index)).png().toBuffer();
 await upload('albedo','png',albedo);await upload('team_mask','png',await sharp(albedo).extractChannel('alpha').png().toBuffer());
 await upload('normal','png',await sharp(texture(mat.normalTexture.index)).png().toBuffer());
 const orm=sharp(texture(mat.pbrMetallicRoughness.metallicRoughnessTexture.index));
 await upload('roughness','png',await orm.clone().extractChannel(1).png().toBuffer());
 await upload('metalness','png',await orm.clone().extractChannel(2).png().toBuffer());
 await upload('image','png',await sharp(`${dir}/render.png`).trim({background:'#4d4d4d',threshold:12}).resize(128,128,{fit:'contain',background:'#202020'}).png().toBuffer());
 const asset=await store.get(id);
 await store.dispatch({op:'asset.save',expectedRevision:asset.revision,definition:{...asset,name,tags:['original',faction,'main-building','tripo','team-mask'],
  bindings:{profile:'building',faction,render:[{id:`asset.${faction}.${short}`,geometry:{asset:id,role:'geometry',index:1},scale:1,healthHeight:stats.dimensions[2]},{id:`icon.${faction}.${short}`,image:{asset:id,role:'image',index:1}}],scenery:[]},
  capabilities:{groundContact:{mode:'pivot'},blocker:{shape:'box',size:[20,20],offset:[0,0]},vegetationClearance:10,teamColor:{mode:'mask',slots:['TC_TeamColor'],mask:{role:'team_mask',index:1}}},
  materials:[{slot:'TC_TeamColor',shader:'standard',color:'#ffffff',roughness:1,metalness:faction==='ants'?0:1,alphaMode:'opaque',alphaCutoff:.4,doubleSided:false,
   textures:{albedo:{role:'albedo',index:1},normal:{role:'normal',index:1},roughness:{role:'roughness',index:1},metalness:{role:'metalness',index:1},teamMask:{role:'team_mask',index:1}}}],
  provenance:{method:'generated',licenseNote:'Original artwork created for Under the Canopy.',generation:{role:'generation',index:1}}}});
 await store.dispatch({op:'asset.validate',id});await store.dispatch({op:'asset.publish',id,expectedRevision:(await store.get(id)).revision});
 console.log('Published',id,stats);
}
