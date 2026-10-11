import sharp from 'sharp';
export type GroundPixels={width:number;height:number;rgba:Buffer};
/** Channels may have different source resolutions, but must cover the same UV
 * atlas. Resize independently: opacity must never premultiply color or roughness. */
export async function packGroundAtlas(color:GroundPixels,normal:GroundPixels,orm:GroundPixels,size=1024){
 for(const image of [color,normal,orm]){
  if(image.width<=0||image.height<=0||image.rgba.length!==image.width*image.height*4)throw Error('Invalid ground channel pixels');
  if(image.width*color.height!==color.width*image.height)throw Error('Ground channel atlas aspect ratios differ');
 }
 const rgb=async({rgba,width,height}:GroundPixels)=>{
  // Strip alpha before entering Sharp: its pipeline can resize before removeAlpha,
  // which otherwise premultiplies transition texels and creates dark fringes.
  const bytes=Buffer.alloc(width*height*3);
  for(let i=0;i<width*height;i++)rgba.copy(bytes,i*3,i*4,i*4+3);
  return sharp(bytes,{raw:{width,height,channels:3}}).resize(size,size,{fit:'fill'}).raw().toBuffer();
 };
 const channel=async({rgba,width,height}:GroundPixels,c:number)=>{
  const bytes=Buffer.alloc(width*height);for(let i=0;i<bytes.length;i++)bytes[i]=rgba[i*4+c]!;
  return sharp(bytes,{raw:{width,height,channels:1}}).resize(size,size,{fit:'fill'}).greyscale().raw().toBuffer();
 };
 const [albedo,normals,rough,opacity,ao,metal]=await Promise.all([rgb(color),rgb(normal),channel(orm,1),channel(color,3),channel(orm,0),channel(orm,2)]);
 const ar=Buffer.alloc(size*size*4),nh=Buffer.alloc(ar.length),om=Buffer.alloc(ar.length);
 for(let i=0;i<size*size;i++){
  albedo.copy(ar,i*4,i*3,i*3+3);ar[i*4+3]=rough[i]!;
  normals.copy(nh,i*4,i*3,i*3+3);nh[i*4+3]=opacity[i]!;
  om[i*4]=ao[i]!;om[i*4+1]=metal[i]!;om[i*4+3]=255;
 }
 return {ar,nh,om};
}
