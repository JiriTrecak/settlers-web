/** Publish ground foliage adapted from the licensed PL Stylized Fantasy Foliage
 * pack. Input is the output folder of art/recipes/pl_foliage.py.
 * Usage: node --import tsx scripts/assets/publish-pl-foliage.ts tmp/env-art/pl [slug ...] */
import {readFile,readdir} from 'node:fs/promises';
import {AuthoringStore} from '../../tooling/asset-studio/server/authoring/store';
import {readGlb} from '../../tooling/asset-studio/server/authoring/modelQuality';
import type {FileRole} from '../../src/shared/authoring/asset';

const store=new AuthoringStore(process.cwd());
const LICENSE='Adapted from the purchased PL Stylized Fantasy Foliage Environment Assets Pack (licensed for this project); mesh rescaled and re-pivoted, albedo downsized.';
// Ferns sway less than grass blades; flower heads a little more than ferns.
const WIND:Record<string,{strength:number;speed:number;stiffness:number}>={grass:{strength:.14,speed:.22,stiffness:.7},flowers:{strength:.1,speed:.2,stiffness:.8},daisy:{strength:.1,speed:.2,stiffness:.8},fern:{strength:.05,speed:.16,stiffness:.9}};

async function upload(id:string,role:FileRole,format:string,bytes:Buffer,index=1){
 const a=await store.get(id);
 await store.dispatch({op:'asset.upload',id,expectedRevision:a.revision,role,index,format,base64:bytes.toString('base64')});
}
/** Blender writes alpha as BLEND; instanced foliage must alpha-clip so it depth-sorts and casts cut-out shadows. */
function clipAlpha(bytes:Buffer){
 const {doc,bin}=readGlb(bytes);
 for(const m of doc.materials??[]){m.alphaMode='MASK';m.alphaCutoff=.5;}
 let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
 const body=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);
 const h=Buffer.alloc(20),b=Buffer.alloc(8);h.writeUInt32LE(0x46546c67);h.writeUInt32LE(2,4);h.writeUInt32LE(28+json.length+body.length,8);h.writeUInt32LE(json.length,12);h.writeUInt32LE(0x4e4f534a,16);b.writeUInt32LE(body.length);b.writeUInt32LE(0x004e4942,4);
 return Buffer.concat([h,json,b,body]);
}

const root=process.argv[2]!,slugs=process.argv.slice(3);
for(const slug of slugs.length?slugs:await readdir(root)){
 const dir=`${root}/${slug}`,build=JSON.parse(await readFile(`${dir}/build.json`,'utf8'));
 const id=`asset.models.environment.${slug}`,family=slug.split('-')[1]!,name=slug.replace(/^pl-/,'').replace(/-/g,' ');
 try{await store.get(id);}catch{
  await store.dispatch({op:'asset.create',definition:{version:1,id,name,kind:'foliage',revision:1,status:'draft',tags:['pl-pack','woodland',family],resources:[],usesGeometry:false,
   transform:{scale:1,pivot:[0,0,0],up:'Y',forward:'+Z'},materials:[],bindings:{profile:'model',render:[],scenery:[]},capabilities:{},provenance:{method:'import',licenseNote:LICENSE}}});
 }
 await upload(id,'geometry','glb',clipAlpha(await readFile(`${dir}/geometry.glb`)));
 await upload(id,'albedo','png',await readFile(`${dir}/albedo.png`));
 await upload(id,'source','blend',await readFile(`${dir}/source.blend`));
 await upload(id,'recipe','py',await readFile('art/recipes/pl_foliage.py'));
 await upload(id,'generation','json',Buffer.from(JSON.stringify({method:'pl-pack adaptation',...build},null,2)+'\n'));
 const a=await store.get(id);
 await store.dispatch({op:'asset.save',expectedRevision:a.revision,definition:{...a,
  bindings:{profile:'model',render:[],scenery:[{id:slug,name,category:'foliage',type:'prop',geometry:{role:'geometry',index:1}}]},
  capabilities:{wind:{mode:'grass',...WIND[family]!},groundContact:{mode:'terrain'}},
  provenance:{method:'import',licenseNote:LICENSE,generation:{role:'generation',index:1}}}});
 await store.dispatch({op:'asset.validate',id});
 await store.dispatch({op:'asset.publish',id,expectedRevision:(await store.get(id)).revision});
 console.log('Published',id,build.triangles,'tris');
}
