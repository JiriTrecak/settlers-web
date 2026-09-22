import {CubeTexture,DataTexture,LinearFilter,LinearMipmapLinearFilter,SRGBColorSpace} from 'three';
import url from '../../../assets/library/asset.texture.woodland-reflection/data.bin?url';
import metadata from '../../../assets/library/asset.texture.woodland-reflection/data_2.json';
import brdfUrl from '../../../assets/library/asset.texture.woodland-brdf/data.bin?url';
import brdfMetadata from '../../../assets/library/asset.texture.woodland-brdf/data_2.json';

/** Original analytic woodland sky with explicit roughness mip levels. */
export function sourceReflection(){
 const texture=new CubeTexture(Array.from({length:6},()=>new DataTexture(new Uint8Array([0,0,0,255]),1,1)));
 texture.generateMipmaps=false;texture.minFilter=LinearFilter;texture.colorSpace=SRGBColorSpace;texture.needsUpdate=true;
 const brdf=new DataTexture(new Uint8Array([255,0,0,255]),1,1);brdf.needsUpdate=true;
 let disposed=false;
 let loading:Promise<void>|undefined;
 const load=()=>loading??=(async()=>{
  const response=await fetch(url);if(!response.ok)throw Error(`Source reflection cube: ${response.status}`);
  const bytes=new Uint8Array(await new Response(response.body!.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  if(bytes.length!==metadata.decodedBytes)throw Error('Truncated source reflection cube');
  const brdfResponse=await fetch(brdfUrl);if(!brdfResponse.ok||!brdfResponse.body)throw Error('Source BRDF LUT unavailable');
  const brdfBytes=new Uint8Array(await new Response(brdfResponse.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  if(brdfBytes.length!==brdfMetadata.decodedBytes)throw Error('Truncated source BRDF LUT');
  if(disposed)return;
  brdf.dispose();brdf.image={data:brdfBytes,width:brdfMetadata.width,height:brdfMetadata.height};
  brdf.minFilter=brdf.magFilter=LinearFilter;brdf.needsUpdate=true;
  const levels:DataTexture[][]=[];let offset=0;
  for(let level=0;level<metadata.levels;level++){
   const size=metadata.size>>level,faces:DataTexture[]=[];
   for(let face=0;face<6;face++){const length=size*size*4;faces.push(new DataTexture(bytes.subarray(offset,offset+length),size,size));offset+=length;}
   levels.push(faces);
  }
  texture.dispose();texture.images=levels[0];
  // Three's uncompressed cube mip list excludes level zero.
  texture.mipmaps=levels.slice(1).map(image=>({image})) as unknown as CubeTexture['mipmaps'];
  texture.minFilter=LinearMipmapLinearFilter;texture.magFilter=LinearFilter;texture.needsUpdate=true;
 })();
 return {texture,brdf,get ready(){return load();},dispose(){disposed=true;texture.dispose();brdf.dispose();}};
}
