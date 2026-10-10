import sharp from 'sharp';
/** GPU arrays use a uniform resolution. Resize independent channels so diffuse
 * alpha cannot premultiply color and roughness never acts as transparency. */
export async function packGroundAtlas(width:number,height:number,color:Buffer,normal:Buffer,orm:Buffer,size=1024){
 const rgb=async(data:Buffer)=>sharp(data,{raw:{width,height,channels:4}}).removeAlpha().resize(size,size,{fit:'fill'}).raw().toBuffer();
 const channel=async(data:Buffer,c:number)=>{
  const bytes=Buffer.alloc(width*height);for(let i=0;i<bytes.length;i++)bytes[i]=data[i*4+c]!;
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
