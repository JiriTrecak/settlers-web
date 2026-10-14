import {expect,it} from 'vitest';
import sharp from 'sharp';
import {resizeModelTextures} from '../../tooling/asset-studio/server/authoring/textureExport';
import {readGlb} from '../../tooling/asset-studio/server/authoring/modelQuality';

function glb(doc:Record<string,unknown>,views:Buffer[]){
 const parts:Buffer[]=[],bufferViews:{buffer:number;byteOffset:number;byteLength:number}[]=[];let offset=0;
 for(const view of views){const pad=(4-offset%4)%4;if(pad){parts.push(Buffer.alloc(pad));offset+=pad;}bufferViews.push({buffer:0,byteOffset:offset,byteLength:view.length});parts.push(view);offset+=view.length;}
 const bin=Buffer.concat([...parts,Buffer.alloc((4-offset%4)%4)]);
 const text=Buffer.from(JSON.stringify({...doc,buffers:[{byteLength:bin.length}],bufferViews})),json=Buffer.concat([text,Buffer.alloc((4-text.length%4)%4,32)]);
 const header=Buffer.alloc(20),binaryHeader=Buffer.alloc(8);
 header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+bin.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
 binaryHeader.writeUInt32LE(bin.length);binaryHeader.writeUInt32LE(0x004e4942,4);
 return Buffer.concat([header,json,binaryHeader,bin]);
}
const floats=(values:number[])=>Buffer.from(new Float32Array(values).buffer);

/** A code-built skinned, animated, team-coloured model with oversized albedo and normal textures. */
async function skinnedModel(){
 const albedo=await sharp({create:{width:1024,height:512,channels:4,background:{r:150,g:90,b:40,alpha:.5}}}).png().toBuffer();
 const normal=await sharp({create:{width:1024,height:1024,channels:3,background:{r:128,g:128,b:255}}}).png().toBuffer();
 const views=[
  floats([0,0,0,1,0,0,0,1,0]),
  Buffer.from(new Uint16Array([0,0,0,0,0,0,0,0,0,0,0,0]).buffer),
  floats([1,0,0,0,1,0,0,0,1,0,0,0]),
  floats([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),
  floats([0,1]),
  floats([0,0,0,1,0,.7071068,0,.7071068]),
  albedo,normal,
 ];
 return glb({asset:{version:'2.0'},scene:0,scenes:[{nodes:[0,1]}],
  nodes:[{mesh:0,skin:0},{name:'Spine'}],skins:[{joints:[1],inverseBindMatrices:3}],
  meshes:[{primitives:[{attributes:{POSITION:0,JOINTS_0:1,WEIGHTS_0:2},material:0}]}],
  materials:[{name:'TC_TeamColor',pbrMetallicRoughness:{baseColorTexture:{index:0}},normalTexture:{index:1}}],
  textures:[{source:0},{source:1}],images:[{bufferView:6,mimeType:'image/png'},{bufferView:7,mimeType:'image/png'}],
  accessors:[
   {bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]},
   {bufferView:1,componentType:5123,count:3,type:'VEC4'},
   {bufferView:2,componentType:5126,count:3,type:'VEC4'},
   {bufferView:3,componentType:5126,count:1,type:'MAT4'},
   {bufferView:4,componentType:5126,count:2,type:'SCALAR',min:[0],max:[1]},
   {bufferView:5,componentType:5126,count:2,type:'VEC4'},
  ],
  animations:[{name:'idle',samplers:[{input:4,output:5}],channels:[{sampler:0,target:{node:1,path:'rotation'}}]}]},views);
}

it('reduces textures without changing mesh, animation, rig or team material data, idempotently',async()=>{
 const bytes=await skinnedModel(),original=readGlb(bytes),resized=await resizeModelTextures(bytes,512),result=readGlb(resized);
 for(const key of ['meshes','nodes','skins','animations','accessors','materials'])expect(result.doc[key]).toEqual(original.doc[key]);
 const images=new Set(result.doc.images.map((i:any)=>i.bufferView));
 for(const [i,v] of result.doc.bufferViews.entries()){
  const out=result.bin.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength),old=original.doc.bufferViews[i];
  if(images.has(i)){const meta=await sharp(out).metadata();expect(Math.max(meta.width!,meta.height!)).toBe(512);}
  else expect(out.equals(original.bin.subarray(old.byteOffset??0,(old.byteOffset??0)+old.byteLength))).toBe(true);
 }
 expect((await resizeModelTextures(resized,512)).equals(resized)).toBe(true);
 expect((await resizeModelTextures(bytes,512)).equals(resized)).toBe(true);
});

it('preserves neutral RGB under zero ownership alpha while downsizing',async()=>{
 const pixels=Buffer.alloc(256*256*4);
 for(let y=0;y<256;y++)for(let x=0;x<256;x++){
  const i=(y*256+x)*4;pixels[i]=120;pixels[i+1]=160;pixels[i+2]=200;pixels[i+3]=x<128?0:255;
 }
 const png=await sharp(pixels,{raw:{width:256,height:256,channels:4}}).png().toBuffer();
 const result=readGlb(await resizeModelTextures(glb({asset:{version:'2.0'},images:[{bufferView:0,mimeType:'image/png'}]},[png]),128)),view=result.doc.bufferViews[0];
 const output=await sharp(result.bin.subarray(view.byteOffset,view.byteOffset+view.byteLength)).raw().toBuffer();
 for(const [x,alpha]of [[16,0],[112,255]]){
  const i=(64*128+x)*4;
  expect([...output.subarray(i,i+4)]).toEqual([120,160,200,alpha]);
 }
});
