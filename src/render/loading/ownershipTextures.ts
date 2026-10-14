import {DataTexture,RGBAFormat,TextureLoader,UnsignedByteType} from 'three';
import type {GLTFLoaderPlugin,GLTFParser} from 'three/addons/loaders/GLTFLoader.js';
import {decode} from 'fast-png';

/** Ownership alpha is data, not transparency. WebKit's image decoding can erase
 * authored RGB wherever that mask is zero. Upload lossless RGBA bytes directly,
 * while GLTFLoader still owns caching, samplers, UV transforms and colour space. */
export function ownershipTexturePlugin(parser:GLTFParser):GLTFLoaderPlugin {
 const indices=new Set<number>(parser.json.materials?.flatMap((material:any)=>
  material.extras?.teamColorMask==='baseColorAlpha'&&material.pbrMetallicRoughness?.baseColorTexture
   ?[material.pbrMetallicRoughness.baseColorTexture.index]:[])??[]);
 const loader=new TextureLoader(parser.options.manager);
 loader.load=(url,onLoad,_onProgress,onError)=>{
  const texture=new DataTexture();
  void fetch(url).then(async response=>{
   if(!response.ok)throw Error(`Ownership texture could not load: ${response.status}`);
   const png=decode(await response.arrayBuffer());
   if(png.depth!==8||png.channels!==4||png.palette)throw Error('Ownership masks require an 8-bit RGBA PNG');
   texture.image={data:new Uint8Array(png.data),width:png.width,height:png.height};
   texture.format=RGBAFormat;texture.type=UnsignedByteType;texture.premultiplyAlpha=false;texture.needsUpdate=true;
   onLoad?.(texture as any);
  }).catch(error=>{texture.dispose();onError?.(error);});
  return texture as any;
 };
 return {name:'UTC_lossless_ownership_textures',loadTexture:index=>{
  if(!indices.has(index))return null;
  const source=parser.json.textures[index].source;
  if(parser.json.images[source]?.mimeType!=='image/png')throw Error('Ownership masks require PNG textures');
  return parser.loadTextureImage(index,source,loader).then(texture=>{
   if(!texture)throw Error('Could not decode ownership texture');return texture;
  });
 }};
}
