/** Refresh canonical environment art through the workbench's upload/publication
 * contract. Usage: node --import tsx scripts/assets/refresh-environment-art.ts manifest.json
 * The input manifest is a list of {kind:'terrain'|'pine', id, image, brief}. */
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {AuthoringStore} from '../../tooling/asset-studio/server/authoring/store';
import {readGlb} from '../../tooling/asset-studio/server/authoring/modelQuality';
import type {FileRole} from '../../src/shared/authoring/asset';

const store=new AuthoringStore(process.cwd());
async function upload(id:string,role:FileRole,format:string,bytes:Buffer,index=1){
 const a=await store.get(id);
 await store.dispatch({op:'asset.upload',id,expectedRevision:a.revision,role,index,format,base64:bytes.toString('base64')});
}
async function publish(id:string){
 await store.dispatch({op:'asset.validate',id});
 const a=await store.get(id);
 await store.dispatch({op:'asset.publish',id,expectedRevision:a.revision});
 console.log('Published',id);
}
function glb(doc:any,bin:Buffer,replacements:Map<number,Buffer>){
 const chunks:Buffer[]=[];let offset=0;
 for(const [i,v]of doc.bufferViews.entries()){
  const data=replacements.get(i)??bin.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength);
  const pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}
  v.byteOffset=offset;v.byteLength=data.length;chunks.push(data);offset+=data.length;
 }
 doc.buffers[0].byteLength=offset;
 let binary=Buffer.concat(chunks);binary=Buffer.concat([binary,Buffer.alloc((4-binary.length%4)%4)]);
 let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
 const h=Buffer.alloc(20),b=Buffer.alloc(8);h.writeUInt32LE(0x46546c67);h.writeUInt32LE(2,4);h.writeUInt32LE(28+json.length+binary.length,8);h.writeUInt32LE(json.length,12);h.writeUInt32LE(0x4e4f534a,16);b.writeUInt32LE(binary.length);b.writeUInt32LE(0x004e4942,4);
 return Buffer.concat([h,json,b,binary]);
}
const manifest=JSON.parse(await readFile(process.argv[2]!,'utf8')) as {kind:'terrain'|'pine';id:string;image:string;brief:string}[];
for(const item of manifest){
 const {id,kind,brief}=item,source=await readFile(item.image);
 const receipt=Buffer.from(JSON.stringify({method:'built-in imagegen',originalPixels:true,brief,source:item.image.split('/').pop(),packing:'Periodic normal/height derived from luminance; original colors retained.'},null,2)+'\n');
 if(kind==='terrain'){
  const size=1024,png=await sharp(source).resize(size,size).removeAlpha().png().toBuffer();
  const rgb=await sharp(png).raw().toBuffer(),lum=await sharp(png).greyscale().blur(2).raw().toBuffer();
  const mean=lum.reduce((s,v)=>s+v,0)/lum.length,deviation=Math.sqrt(lum.reduce((s,v)=>s+(v-mean)**2,0)/lum.length);
  const ice=id.includes('winter-dirt'),snow=id.includes('winter'),range=snow?12:18;
  const height=(x:number,y:number)=>Math.max(0,Math.min(255,120+(lum[((y+size)%size)*size+(x+size)%size]!-mean)/Math.max(1,deviation)*range))/255;
  const ar=Buffer.alloc(size*size*4),nh=Buffer.alloc(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const i=y*size+x,j=i*4;rgb.copy(ar,j,i*3,i*3+3);ar[j+3]=ice?150:240;
   const nx=(height(x-1,y)-height(x+1,y))*1.6,ny=(height(x,y-1)-height(x,y+1))*1.6,inv=1/Math.hypot(nx,ny,1);
   nh[j]=Math.round(128+127*nx*inv);nh[j+1]=Math.round(128+127*ny*inv);nh[j+2]=Math.round(128+127*inv);nh[j+3]=Math.round(height(x,y)*255);
  }
  await upload(id,'albedo','png',png);await upload(id,'data','bin',gzipSync(ar,{level:9}));await upload(id,'generation','json',receipt);
  // The manifest's primary source is what future canonical builds materialize.
  const a=await store.get(id);if(a.resources.some(r=>r.role==='source'&&r.index===1&&r.format==='png')){
   await upload(id,'source','png',source);await upload(id,'source','json',receipt,2);
  }
  const normal=id+'-normal';await upload(normal,'data','bin',gzipSync(nh,{level:9}));await upload(normal,'generation','json',receipt);
  await publish(normal);await publish(id);
 }else{
  const png=await sharp(source).resize(1024,1024).png().toBuffer();
  const a=await store.get(id),{bytes}=await store.resource(id,{role:'geometry',index:1});
  const {doc,bin}=readGlb(bytes),replacements=new Map<number,Buffer>();
  for(const m of doc.materials??[]){
   if(!m.extras?.foliage)continue;
   const tex=doc.textures[m.pbrMetallicRoughness.baseColorTexture.index],im=doc.images[tex.source];
   replacements.set(im.bufferView,png);im.mimeType='image/png';
   m.pbrMetallicRoughness.baseColorFactor=[.4,.4,.4,1];
  }
  if(!replacements.size)throw Error('No pine foliage texture: '+id);
  await upload(id,'albedo','png',png);await upload(id,'geometry','glb',glb(doc,bin,replacements));await upload(id,'generation','json',receipt);
  // Keep the editable build input GLBs in sync; rig/vertex/animation bytes survive.
  for(const r of a.resources.filter(r=>r.role==='source'&&r.format==='glb')){
   const src=await store.resource(id,{role:r.role,index:r.index}),{doc:d,bin:b}=readGlb(src.bytes),replace=new Map<number,Buffer>();
   for(const m of d.materials??[])if(/pine needles/i.test(m.name??'')&&m.pbrMetallicRoughness?.baseColorTexture){const im=d.images[d.textures[m.pbrMetallicRoughness.baseColorTexture.index].source];replace.set(im.bufferView,png);im.mimeType='image/png';}
   if(replace.size)await upload(id,'source','glb',glb(d,b,replace),r.index);
  }
  await publish(id);
 }
}
