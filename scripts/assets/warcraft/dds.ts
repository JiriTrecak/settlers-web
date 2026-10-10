import {DdsImage,FOURCC_ATI2} from 'mdx-m3-viewer/dist/cjs/parsers/dds/image';

/** Decode without canvas premultiplication: atlas alpha is a transition mask.
 * BC5 stores normal XY only. Reconstruct Z instead of treating it as RGBA. */
export function decodeGroundDds(input:Uint8Array,normal=false){
 const bytes=Uint8Array.from(input),view=new DataView(bytes.buffer);
 if(bytes.length<128||view.getUint32(0,true)!==0x20534444)throw Error('Invalid DDS header');
 const height=view.getUint32(12,true),width=view.getUint32(16,true);
 if(!width||!height||width>8192||height>8192||width%4||height%4)throw Error('Unsupported DDS dimensions');
 const image=new DdsImage();image.load(bytes);
 const raw=image.getMipmap(0,true);
 const blockBytes=image.format===0x31545844?8:16;
 if(raw.data.length!==width*height/16*blockBytes)throw Error('Truncated DDS pixels');
 if(image.format!==FOURCC_ATI2)return {width,height,rgba:Buffer.from(image.getMipmap(0).data)};
 if(!normal)throw Error('Two-channel DDS is only supported for normal maps');
 const rgba=Buffer.alloc(width*height*4);
 // The dependency's RGTC decoder writes channels at +1/+2 into a two-channel
 // buffer. Decode BC5 here so X is not shifted and the final texel is retained.
 const channels=new Uint8Array(width*height*2);
 for(let by=0;by<height/4;by++)for(let bx=0;bx<width/4;bx++)for(let channel=0;channel<2;channel++){
  const start=(by*(width/4)+bx)*16+channel*8,a=raw.data[start]!,b=raw.data[start+1]!;
  const values=[a,b];
  if(a>b)for(let n=1;n<=6;n++)values.push(Math.round(((7-n)*a+n*b)/7));
  else{for(let n=1;n<=4;n++)values.push(Math.round(((5-n)*a+n*b)/5));values.push(0,255);}
  for(let p=0;p<16;p++){
   const bit=p*3,byte=start+2+(bit>>3),bits=raw.data[byte]!|((raw.data[byte+1]??0)<<8),index=(bits>>(bit&7))&7;
   channels[((by*4+(p>>2))*width+bx*4+(p&3))*2+channel]=values[index]!;
  }
 }
 for(let i=0;i<width*height;i++){
  const x=channels[i*2]!/127.5-1,y=channels[i*2+1]!/127.5-1;
  rgba[i*4]=channels[i*2]!;rgba[i*4+1]=channels[i*2+1]!;
  rgba[i*4+2]=Math.round((Math.sqrt(Math.max(0,1-x*x-y*y))*.5+.5)*255);rgba[i*4+3]=255;
 }
 return {width,height,rgba};
}

/** Source numbering groups the left/right 4×4 halves separately. Convert once
 * during asset import; runtime/editor only know ordinary row-major atlas cells. */
export function warcraftGroundLayout(width:number,height:number){
 if(height%4||(width!==height&&width!==height*2))throw Error('Expected a 4×4 or 8×4 Warcraft ground atlas');
 const columns=width===height?4:8,rows=4;
 const cell=(n:number)=>n<16?Math.floor(n/4)*columns+n%4:Math.floor((n-16)/4)*columns+4+(n-16)%4;
 const fullTiles=columns===8?[...Array.from({length:16},(_,i)=>cell(16+i)),cell(15),cell(0)]:[cell(0),cell(15)];
 // Source bits SE=1, SW=2, NE=4, NW=8; authoring uses NW, NE, SW, SE.
 const corners=Array.from({length:16},(_,mask)=>mask===0?null:cell(((mask&1)<<3)|((mask&2)<<1)|((mask&4)>>1)|((mask&8)>>3)));
 return {columns,rows,fullTiles,corners};
}
