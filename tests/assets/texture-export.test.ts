import {readFile} from 'node:fs/promises';
import {expect,it} from 'vitest';
import sharp from 'sharp';
import {resizeModelTextures} from '../../tooling/asset-studio/server/authoring/textureExport';
import {readGlb} from '../../tooling/asset-studio/server/authoring/modelQuality';
it('reduces real warrior textures without changing mesh, animation, rig or team material data',async()=>{
 const bytes=await readFile('art/assets/asset.models.units.ants-warrior/source_8.glb'),original=readGlb(bytes),result=readGlb(await resizeModelTextures(bytes,512));
 for(const key of ['meshes','nodes','skins','animations','accessors','materials'])expect(result.doc[key]).toEqual(original.doc[key]);
 const images=new Set(result.doc.images.map((i:any)=>i.bufferView));
 for(const [i,v] of result.doc.bufferViews.entries()){
  const out=result.bin.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength),old=original.doc.bufferViews[i];
  if(images.has(i)){const meta=await sharp(out).metadata();expect(Math.max(meta.width!,meta.height!)).toBeLessThanOrEqual(512);}
  else expect(out.equals(original.bin.subarray(old.byteOffset??0,(old.byteOffset??0)+old.byteLength))).toBe(true);
 }
 expect(result.doc.materials.some((m:any)=>m.name?.startsWith('TC_'))).toBe(true);
 expect((await resizeModelTextures(await resizeModelTextures(bytes,512),512)).equals(await resizeModelTextures(bytes,512))).toBe(true);
});

it('preserves neutral RGB under zero ownership alpha while downsizing',async()=>{
 const pixels=Buffer.alloc(256*256*4);
 for(let y=0;y<256;y++)for(let x=0;x<256;x++){
  const i=(y*256+x)*4;pixels[i]=120;pixels[i+1]=160;pixels[i+2]=200;pixels[i+3]=x<128?0:255;
 }
 const png=await sharp(pixels,{raw:{width:256,height:256,channels:4}}).png().toBuffer();
 const doc={asset:{version:'2.0'},buffers:[{byteLength:png.length}],bufferViews:[{buffer:0,byteOffset:0,byteLength:png.length}],images:[{bufferView:0,mimeType:'image/png'}]};
 const text=Buffer.from(JSON.stringify(doc)),json=Buffer.concat([text,Buffer.alloc((4-text.length%4)%4,32)]),bin=Buffer.concat([png,Buffer.alloc((4-png.length%4)%4)]);
 const header=Buffer.alloc(20),binaryHeader=Buffer.alloc(8);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+bin.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);binaryHeader.writeUInt32LE(bin.length);binaryHeader.writeUInt32LE(0x004e4942,4);
 const result=readGlb(await resizeModelTextures(Buffer.concat([header,json,binaryHeader,bin]),128)),view=result.doc.bufferViews[0];
 const output=await sharp(result.bin.subarray(view.byteOffset,view.byteOffset+view.byteLength)).raw().toBuffer();
 for(const [x,alpha]of [[16,0],[112,255]]){
  const i=(64*128+x)*4;
  expect([...output.subarray(i,i+4)]).toEqual([120,160,200,alpha]);
 }
});
