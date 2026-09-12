import { LinearMipmapLinearFilter, SRGBColorSpace, TextureLoader, type Texture } from 'three';
import atlasUrl from '../../../assets/textures/materials/ants/surface-atlas.png?url';

/** Shared original material atlas. Quadrant UVs are sampled in shaders, without
 * cropping or duplicating the texture. Top: timber/shell; bottom: stone/soil. */
let atlas:Texture|undefined;
export function getAntSurfaceAtlas():Texture {
 return atlas ??= new TextureLoader().load(atlasUrl, texture => {
  texture.colorSpace=SRGBColorSpace;
  texture.anisotropy=8;
  texture.minFilter=LinearMipmapLinearFilter;
 });
}
