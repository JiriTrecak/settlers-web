/** Set pine needle lighting extras (crownNormal/backsideLighting) on the published
 * pines through the workbench upload/publication contract. Only the glTF JSON
 * chunk changes; geometry, textures and harvest clips are untouched.
 * Usage: node --import tsx scripts/assets/tune-pine-lighting.ts [crownNormal] [backsideLighting] */
import {AuthoringStore} from '../../tooling/asset-studio/server/authoring/store';
import type {FileRole} from '../../src/shared/authoring/asset';

const store=new AuthoringStore(process.cwd());
const crownNormal=Number(process.argv[2]??.25),backsideLighting=Number(process.argv[3]??.12);
const ids=['woodland-pine-a','woodland-pine-b','woodland-pine-sapling'].map(s=>'asset.models.environment.'+s);

function retune(bytes:Buffer):Buffer|undefined{
 const n=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+n).toString()),rest=bytes.subarray(20+n);
 let touched=false;
 for(const m of doc.materials??[])if(/pine needles/i.test(m.name??'')){m.extras={...m.extras,crownNormal,backsideLighting};touched=true;}
 if(!touched)return undefined;
 let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
 const h=Buffer.alloc(20);h.writeUInt32LE(0x46546c67);h.writeUInt32LE(2,4);h.writeUInt32LE(20+json.length+rest.length,8);h.writeUInt32LE(json.length,12);h.writeUInt32LE(0x4e4f534a,16);
 return Buffer.concat([h,json,rest]);
}
for(const id of ids){
 const a=await store.get(id);
 for(const r of a.resources.filter(r=>r.format==='glb')){
  const {bytes}=await store.resource(id,{role:r.role,index:r.index}),next=retune(Buffer.from(bytes));if(!next)continue;
  const cur=await store.get(id);
  await store.dispatch({op:'asset.upload',id,expectedRevision:cur.revision,role:r.role as FileRole,index:r.index,format:'glb',base64:next.toString('base64')});
 }
 await store.dispatch({op:'asset.validate',id});
 await store.dispatch({op:'asset.publish',id,expectedRevision:(await store.get(id)).revision});
 console.log('Published',id,{crownNormal,backsideLighting});
}
