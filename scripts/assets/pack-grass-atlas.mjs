/** Pack transparent original artwork into padded UV cells; do not repaint it. */
import sharp from 'sharp';import fs from 'node:fs/promises';
const dir='art/sources/textures/woodland-grass-cards',src=dir+'/source.png',meta=await sharp(src).metadata(),pieces=[];
const raw=await sharp(src).ensureAlpha().raw().toBuffer(),w=meta.width,h=meta.height;
for(let cell=0;cell<6;cell++){
 const x0=Math.floor(cell%3*w/3),x1=Math.floor((cell%3+1)*w/3),y0=Math.floor(Math.floor(cell/3)*h/2),y1=Math.floor((Math.floor(cell/3)+1)*h/2);
 let minX=x1,minY=y1,maxX=x0,maxY=y0;
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(raw[(y*w+x)*4+3]>180){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
 const input=await sharp(src).extract({left:minX,top:minY,width:maxX-minX+1,height:maxY-minY+1}).resize(120,120,{fit:'fill'}).extend({top:4,bottom:4,left:4,right:4,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
 pieces.push({input,left:cell%3*128,top:Math.floor(cell/3)*128});
}
await sharp({create:{width:384,height:256,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(pieces).png().toFile(dir+'/albedo.png');
await fs.writeFile(dir+'/generation.json',JSON.stringify({method:'imagegen',originalPixels:true,source:'exec-691299c0-b02b-41ed-935f-ca41725e1b6e.png',packing:'Alpha bounds cropped independently into six 128px padded cells; artwork not repainted.'},null,2)+'\n');
