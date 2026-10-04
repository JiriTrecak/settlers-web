import {DataArrayTexture,LinearFilter,LinearMipmapLinearFilter,RepeatWrapping,SRGBColorSpace} from 'three';
import {terrainTilePixels,TERRAIN_TILE_SIZE} from './terrainTilePixels';
export async function terrainTileArray(names:string[],color:boolean):Promise<DataArrayTexture>{
 const size=TERRAIN_TILE_SIZE,data=new Uint8Array(size*size*4*names.length);
 // Decode exact independent channels, without premultiplied-alpha canvas conversion.
 await Promise.all(names.map(async(name,i)=>data.set(await terrainTilePixels(name),i*size*size*4)));
 const tex=new DataArrayTexture(data,size,size,names.length);tex.wrapS=tex.wrapT=RepeatWrapping;tex.magFilter=LinearFilter;tex.minFilter=LinearMipmapLinearFilter;tex.generateMipmaps=true;tex.anisotropy=8;if(color)tex.colorSpace=SRGBColorSpace;tex.needsUpdate=true;return tex;
}
