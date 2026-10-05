import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {releaseImage,type ReleaseImage} from '../../src/shared/release/schema.ts';
const maxBytes=768*1024;
const sha256=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
/** Strip metadata, orient correctly, bound dimensions and compress before storing anything. */
export async function prepareImage(file:string,alt:string,caption?:string){
 if((await stat(file)).size>25*1024**2)throw Error('Release image source exceeds 25 MiB');
 const input=await readFile(file),metadata=await sharp(input,{limitInputPixels:40_000_000}).metadata();
 if(!['png','jpeg','webp'].includes(metadata.format??'')||(metadata.pages??1)>1)throw Error('Use a static PNG, JPEG or WebP image');
 let bytes:Buffer|undefined;
 for(const quality of [82,70,55]){
  bytes=await sharp(input,{limitInputPixels:40_000_000}).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality,effort:4}).toBuffer();
  if(bytes.length<=maxBytes)break;
 }
 if(!bytes||bytes.length>maxBytes)throw Error('Image remains too large after compression; crop or simplify it first');
 const size=await sharp(bytes).metadata();
 const image=releaseImage.parse({file:sha256(bytes)+'.webp',alt,caption:caption||undefined,width:size.width,height:size.height});
 return {image,bytes};
}
/** Verify media against its immutable filename and declared dimensions at every publishing boundary. */
export async function verifyImage(folder:string,image:ReleaseImage){
 releaseImage.parse(image);
 const file=join(folder,image.file);
 if((await stat(file)).size>maxBytes)throw Error(`Gallery image exceeds 768 KiB: ${image.file}`);
 const bytes=await readFile(file);
 if(sha256(bytes)+'.webp'!==image.file)throw Error(`Gallery image hash mismatch: ${image.file}`);
 const metadata=await sharp(bytes,{limitInputPixels:1600*1600}).metadata();
 if(metadata.format!=='webp'||(metadata.pages??1)>1||metadata.width!==image.width||metadata.height!==image.height)throw Error(`Gallery image dimensions or format differ: ${image.file}`);
 return file;
}
