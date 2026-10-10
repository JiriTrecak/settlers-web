import {DataArrayTexture,LinearFilter,LinearMipmapLinearFilter,RepeatWrapping,SRGBColorSpace} from 'three';
import {terrainTilePixels,TERRAIN_TILE_SIZE} from './terrainTilePixels';
import {groundTextures} from '../../shared/authoring/groundTextures';
export async function terrainTileArray(names:string[],color:boolean,channel:'ar'|'nh'|'om'=color?'ar':'nh'):Promise<DataArrayTexture>{
 const size=TERRAIN_TILE_SIZE,data=new Uint8Array(size*size*4*names.length);
 // Decode exact independent channels, without premultiplied-alpha canvas conversion.
 await Promise.all(names.map(async(name,i)=>{
  if(channel==='om'&&!groundTextures.has(name)){for(let j=i*size*size*4;j<(i+1)*size*size*4;j+=4){data[j]=255;data[j+3]=255;}return;}
  data.set(await terrainTilePixels(name,channel),i*size*size*4);
 }));
 const tex=new DataArrayTexture(data,size,size,names.length);tex.wrapS=tex.wrapT=RepeatWrapping;tex.magFilter=LinearFilter;tex.minFilter=LinearMipmapLinearFilter;tex.generateMipmaps=true;tex.anisotropy=8;if(color)tex.colorSpace=SRGBColorSpace;tex.needsUpdate=true;return tex;
}
