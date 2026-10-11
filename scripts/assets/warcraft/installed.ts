import {createHash} from 'node:crypto';
import {decodeGroundDds} from './dds';

export type WarcraftGraphics='classic'|'reforged'|'definitive';
export function graphicsMode(value?:string):WarcraftGraphics {
 if(value==='classic')return 'classic';
 if(value==='reforged')return 'reforged';
 if(value===undefined||value==='definitive')return 'definitive';
 throw Error('Graphics must be classic, reforged or definitive');
}

/** Classic artwork carries its relief in the painted diffuse image. Do not pair
 * it with unrelated Reforged normals/ORM or infer bump heights from its colors. */
export async function installedGroundChannels(base:string,graphics:WarcraftGraphics,extract:(name:string)=>Promise<Buffer>){
 const result=[];
 for(const channel of ['diffuse','normal','orm'] as const){
  const generated=graphics==='classic'&&channel!=='diffuse';
  const path=generated?`neutral:${channel}`:`war3.w3mod:${graphics==='definitive'?'_de.w3mod:':graphics==='reforged'?'_hd.w3mod:':''}${base}${graphics!=='classic'?'_'+channel:''}.dds`;
  let bytes:Buffer,pixels:ReturnType<typeof decodeGroundDds>;
  if(generated){
   const {width,height}=result[0]!.pixels;
   bytes=Buffer.alloc(width*height*4);
   const value=channel==='normal'?[128,128,255,255]:[255,255,0,255];
   for(let i=0;i<bytes.length;i+=4)bytes.set(value,i);
   pixels={width,height,rgba:Buffer.from(bytes)};
  }else{bytes=await extract(path);pixels=decodeGroundDds(bytes,channel==='normal');}
  result.push({channel,bytes,pixels,origin:generated?'neutral-material':`installed-${graphics}`,path,sha256:createHash('sha256').update(bytes).digest('hex')});
 }
 return result;
}
