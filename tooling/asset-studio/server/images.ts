import sharp from 'sharp';
import {imageProfiles} from '../shared/profiles';
import {readFile} from 'node:fs/promises';
import {atomic,hash,within} from './storage';
import type {Candidate,JobRequest} from '../shared/schema';
export async function processImage(root:string,source:string,destination:string,request:JobRequest):Promise<Candidate>{
 const original=await readFile(await within(root,source));
 if(original.length>50*1024*1024)throw Error('Image exceeds 50 MiB');
 const decoder=sharp(original,{limitInputPixels:40_000_000,failOn:'error'}),meta=await decoder.metadata();
 if(!['png','jpeg','webp'].includes(meta.format||''))throw Error('Use PNG, JPEG or WebP.');
 if((meta.pages??1)>1)throw Error('Animated images are not supported.');
 const crop=request.transform.crop,padding=request.transform.padding??0;
 if(padding*2>=Math.min(request.width,request.height))throw Error("Padding must leave space for the image.");
 const width=crop?.width??meta.width!,height=crop?.height??meta.height!;
 if(width<request.width||height<request.height)throw Error('Source is smaller than the export. Upscaling is not allowed.');
 let pipeline=decoder.rotate().toColourspace('srgb');
 if(crop)pipeline=pipeline.extract(crop);
 const data=await pipeline.resize(request.width-padding*2,request.height-padding*2,{fit:request.transform.fit,background:request.transform.background,kernel:sharp.kernel.lanczos3,withoutEnlargement:true}).extend({top:padding,bottom:padding,left:padding,right:padding,background:'#00000000'}).png({compressionLevel:9,palette:false}).toBuffer();
 const {data:pixels,info}=await sharp(data).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const errors:string[]=[],warnings:string[]=[];let transparent=0,partial=0,opaque=0,openingPixels=0,openingBad=0,edgeBad=0,edges=0;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
  const alpha=pixels[(y*info.width+x)*4+3];if(alpha===0)transparent++;else if(alpha===255)opaque++;else partial++;
  const o=request.opening;
  if(o&&x>=Math.ceil(o.x*info.width)&&x<Math.floor((o.x+o.width)*info.width)&&y>=Math.ceil(o.y*info.height)&&y<Math.floor((o.y+o.height)*info.height)){openingPixels++;if(alpha>5)openingBad++;}
  if(x===0||y===0||x===info.width-1||y===info.height-1){edges++;if(alpha>5)edgeBad++;}
 }
 if(request.profile==='interface-rim'){
  if(!transparent)errors.push('No fully transparent pixels. This is not a transparent rim.');
  if(!openingPixels||openingBad)errors.push(`Protected opening is not transparent (${openingBad} painted pixels).`);
  if(edgeBad)errors.push(`Exterior edge must be transparent (${edgeBad}/${edges} painted pixels). Add breathing room.`);
 }
 if(data.length>imageProfiles[request.profile].warningBytes)warnings.push(`PNG exceeds the ${Math.round(imageProfiles[request.profile].warningBytes/1024)} KiB profile budget.`);
 if(!transparent&&request.parameters.background==='transparent')errors.push('Transparent output was requested, but the image is fully opaque.');
 await atomic(await within(root,destination),data);
 return {id:destination.split('/').at(-1)!.replace('.png',''),source,sourceHash:hash(original),output:destination,outputHash:hash(data),errors,warnings,width:info.width,height:info.height,bytes:data.length,alpha:{transparent,partial,opaque}};
}
export function approvalHash(candidate:Candidate,request:JobRequest){return hash(JSON.stringify({source:candidate.sourceHash,output:candidate.outputHash,request}));}
