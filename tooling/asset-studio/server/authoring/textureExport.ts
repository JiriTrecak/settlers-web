import sharp from 'sharp';
import {readGlb} from './modelQuality';

/** Resize embedded textures only. Geometry, skin weights, clips and material
 * extras remain byte-for-byte intact. Alpha can contain team masks, so filter
 * it independently instead of treating it as opacity during RGB resampling. */
export async function resizeModelTextures(bytes:Buffer,limit=512):Promise<Buffer>{
 if(![128,256,512,1024,2048,4096].includes(limit))throw Error('Unsupported texture size');
 const {doc,bin}=readGlb(bytes), replacements=new Map<number,Buffer>();
 const normalImages=new Set<number>((doc.materials??[]).flatMap((m:any)=>m.normalTexture?[doc.textures[m.normalTexture.index].source]:[]));
 for(const [index,img] of (doc.images??[]).entries()){
  const view=doc.bufferViews[img.bufferView];if(!view)throw Error('Texture has no embedded buffer view');
  const input=bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength),meta=await sharp(input).metadata();
  if(Math.max(meta.width!,meta.height!)<=limit)continue;
  const factor=limit/Math.max(meta.width!,meta.height!),width=Math.max(1,Math.round(meta.width!*factor)),height=Math.max(1,Math.round(meta.height!*factor));
  let rgb=await sharp(input).removeAlpha().toColourspace('srgb').resize(width,height,{kernel:'lanczos3'}).raw().toBuffer();
  if(normalImages.has(index))for(let i=0;i<rgb.length;i+=3){const x=rgb[i]/127.5-1,y=rgb[i+1]/127.5-1,z=rgb[i+2]/127.5-1,n=Math.hypot(x,y,z)||1;rgb[i]=Math.round((x/n+1)*127.5);rgb[i+1]=Math.round((y/n+1)*127.5);rgb[i+2]=Math.round((z/n+1)*127.5);}
  let output=sharp(rgb,{raw:{width,height,channels:3}});
  if(meta.hasAlpha){const alpha=await sharp(input).extractChannel('alpha').resize(width,height).raw().toBuffer();output=output.joinChannel(alpha,{raw:{width,height,channels:1}});}
  const jpeg=meta.format==='jpeg'&&!meta.hasAlpha&&!normalImages.has(index);
  replacements.set(img.bufferView,await (jpeg?output.jpeg({quality:90,chromaSubsampling:'4:4:4'}):output.png()).toBuffer());img.mimeType=jpeg?'image/jpeg':'image/png';
 }
 if(!replacements.size)return bytes;
 if((doc.bufferViews??[]).some((v:any)=>v.extensions)|| (doc.meshes??[]).some((m:any)=>m.primitives.some((p:any)=>p.extensions?.KHR_draco_mesh_compression)))throw Error('Optimize textures before mesh compression');
 const chunks:Buffer[]=[];let offset=0;
 for(const [i,v] of doc.bufferViews.entries()){
  const data=replacements.get(i)??bin.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength);
  const pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}
  v.byteOffset=offset;v.byteLength=data.length;chunks.push(data);offset+=data.length;
 }
 doc.buffers[0].byteLength=offset;
 let binary=Buffer.concat(chunks);binary=Buffer.concat([binary,Buffer.alloc((4-binary.length%4)%4)]);
 let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
 const head=Buffer.alloc(20),bh=Buffer.alloc(8);head.writeUInt32LE(0x46546c67);head.writeUInt32LE(2,4);head.writeUInt32LE(28+json.length+binary.length,8);head.writeUInt32LE(json.length,12);head.writeUInt32LE(0x4e4f534a,16);bh.writeUInt32LE(binary.length);bh.writeUInt32LE(0x004e4942,4);
 return Buffer.concat([head,json,bh,binary]);
}
