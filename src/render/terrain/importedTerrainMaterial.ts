import {terrainTextureUrl} from './terrainTextureUrl';
import {sourceTerrainGLSL} from './sourceTerrainShader';
import {DataArrayTexture,DataTexture,LinearFilter,LinearMipmapLinearFilter,NearestFilter,RedFormat,RepeatWrapping,SRGBColorSpace,Vector2,Vector4,type WebGLProgramParametersWithUniforms} from 'three';
import {unpackSourceBytes,sourceHeight,type ImportedTerrain} from '../../shared/map/importedTerrain';
import {ReferenceGround} from '../prop/referenceGround';
import {referenceTexture,macroUrl} from './referenceTerrain';
import {assetUrls} from '../../shared/assets/urls.generated';
async function tileArray(names:string[],color:boolean):Promise<DataArrayTexture>{
 const size=1024,data=new Uint8Array(size*size*4*names.length);
 // Decode exact independent channels, without premultiplied-alpha canvas conversion.
 for(let i=0;i<names.length;i++){
  const url=terrainTextureUrl(names[i]!);if(!url)throw Error(`Missing terrain texture ${names[i]}`);
  const response=await fetch(url);if(!response.ok||!response.body)throw Error(`Failed terrain texture ${names[i]}`);
  const raw=new Uint8Array(await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  if(raw.length!==size*size*4)throw Error('Source tile dimensions mismatch');
  data.set(raw,i*size*size*4);
 }
 const tex=new DataArrayTexture(data,size,size,names.length);tex.wrapS=tex.wrapT=RepeatWrapping;tex.magFilter=LinearFilter;tex.minFilter=LinearMipmapLinearFilter;tex.generateMipmaps=true;tex.anisotropy=8;if(color)tex.colorSpace=SRGBColorSpace;tex.needsUpdate=true;return tex;
}
export class ImportedTerrainMaterial {
 readonly ready:Promise<void>;
 private disposed=false;
 private ar={value:new DataArrayTexture(new Uint8Array([128,128,128,255]),1,1,1)};
 private nh={value:new DataArrayTexture(new Uint8Array([128,128,255,128]),1,1,1)};
 private displacement={value:new DataArrayTexture(new Uint8Array([128,128,255,64]),1,1,1)};
 private displacementMask:DataTexture;
 private masks:DataArrayTexture;
 private slots:DataTexture;
 private macro=referenceTexture(macroUrl,false);
 private ground=new ReferenceGround();
 constructor(readonly source:ImportedTerrain){
  if(source.layers.some(l=>l.ar.startsWith('asset.terrain.winter-'))){this.macro.dispose();this.macro=referenceTexture(assetUrls['assets/library/asset.texture.winter-macro/albedo.png'],false);}
  this.ground.updateSource(sourceHeight(source));
  const [dw,dh]=source.maskSize;
  this.displacementMask=new DataTexture(source.displacement?unpackSourceBytes(source.displacement.mask):new Uint8Array(dw*dh),dw,dh,RedFormat);
  this.displacementMask.minFilter=this.displacementMask.magFilter=LinearFilter;this.displacementMask.needsUpdate=true;
  this.displacement.value.needsUpdate=true;
  const [w,h]=source.maskSize,maskData=new Uint8Array(w*h*source.layers.length);maskData.fill(255,0,w*h);
  source.layers.forEach((layer,i)=>{if(layer.mask)maskData.set(unpackSourceBytes(layer.mask),w*h*i);});
  this.masks=new DataArrayTexture(maskData,w,h,source.layers.length);this.masks.format=RedFormat;this.masks.minFilter=this.masks.magFilter=LinearFilter;this.masks.needsUpdate=true;
  const sw=source.blocks[0]*4,sh=source.blocks[1]*4,slotData=new Uint8Array(sw*sh*8).fill(255),raw=unpackSourceBytes(source.layerSlots);
  for(let bz=0;bz<source.blocks[1];bz++)for(let bx=0;bx<source.blocks[0];bx++)for(let j=0;j<16;j++){
   const offset=((bz*source.blocks[0]+bx)*16+j)*6,to=((bz*4+Math.floor(j/4))*sw+bx*4+j%4)*8;
   slotData.set(raw.subarray(offset,offset+6),to);
  }
  this.slots=new DataTexture(slotData,sw*2,sh);this.slots.minFilter=this.slots.magFilter=NearestFilter;this.slots.needsUpdate=true;
  this.ar.value.needsUpdate=this.nh.value.needsUpdate=true;
  this.ready=Promise.all([tileArray(source.layers.map(l=>l.ar),true),tileArray(source.layers.map(l=>l.nh),false),this.ground.ready,source.displacement?tileArray([source.displacement.texture],false):Promise.resolve(undefined),this.macro.referenceReady]).then(([ar,nh,,displacement])=>{
   if(this.disposed){ar.dispose();nh.dispose();displacement?.dispose();return;}this.ar.value.dispose();this.nh.value.dispose();this.ar.value=ar;this.nh.value=nh;
   if(displacement){this.displacement.value.dispose();this.displacement.value=displacement;}
  });
 }
 private uniforms(shader:WebGLProgramParametersWithUniforms){
  const s=this.source;
  Object.assign(shader.uniforms,{uSourceHeightScale:{value:s.heightSamplesPerUnit??3},uSourceAR:this.ar,uSourceNH:this.nh,uSourceMasks:{value:this.masks},uSourceSlots:{value:this.slots},uSourceMacro:{value:this.macro},uTerrainUnderlay:this.ground.underlay,uSourceHeight:this.ground.texture,uSourceHeightSize:{value:new Vector2(...s.heightSize)},uSourceDisplacement:this.displacement,uSourceDisplacementMask:{value:this.displacementMask},uSourceHasDisplacement:{value:s.displacement?1:0},uSourceDisplacementTiling:{value:s.displacement?.tiling??1},uSourceOrigin:{value:new Vector2(...s.origin)},uSourceOffset:{value:new Vector2(s.origin[0]-s.sourceOrigin[0],s.origin[1]-s.sourceOrigin[1])},uSourceSize:{value:new Vector2(s.blocks[0]*16,s.blocks[1]*16)},uSourceParams:{value:s.layers.map(l=>new Vector4(l.tiling,l.blend,l.verticality,l.edge))},uSourceDesaturation:{value:s.layers.map(l=>l.desaturation)}});
 }
 /** Rebind existing GPU programs after editable terrain replaces its textures.
  * Three caches programs by shader source, so onBeforeCompile alone is insufficient. */
 bindUniforms(shader:WebGLProgramParametersWithUniforms,depth=false){
  this.uniforms(shader);
  if(!depth)this.ground.bindSurfaceUniforms(shader,this.macro);
 }
 compileDepth(shader:WebGLProgramParametersWithUniforms){
  this.uniforms(shader);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n'+sourceTerrainGLSL(this.source.layers.length))
   .replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed=terrainDisplace(transformed);');
 }
 compile(shader:WebGLProgramParametersWithUniforms){
  this.uniforms(shader);
  const shared=sourceTerrainGLSL(this.source.layers.length);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n'+shared+'\nvarying vec3 vSourcePosition;varying vec3 vSourceDisplaced;')
   .replace('#include <begin_vertex>','#include <begin_vertex>\nvSourcePosition=position;transformed=terrainDisplace(transformed);vSourceDisplaced=transformed;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+shared+'\nvarying vec3 vSourcePosition,vSourceDisplaced;uniform sampler2D uSourceMacro;')
   .replace('#include <map_fragment>',`
    vec3 sourceBaseNormal=terrainNormal(vSourceDisplaced.xz);
    vec4 sourceAR,sourceNH;terrainLayers(vSourcePosition.xz,sourceBaseNormal.y,sourceAR,sourceNH);
    diffuseColor.rgb*=sourceAR.rgb*texture2D(uSourceMacro,(vSourcePosition.xz-uSourceOffset)*.01).rgb*2.;
   `).replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=sourceAR.a;')
   .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
    normal=normalize(mat3(viewMatrix)*terrainBasis(sourceBaseNormal)*(2.*(sourceNH.rgb-.50196)*vec3(1.,1.,.25)));
   `);
  // Terrain.fx defines FORCE_LIGHTMAP_OCCLUSION_LEVEL0: no ground-color bounce.
  this.ground.compileSurface(shader,this.macro,false,false,false);
  // Both stages must use the same uniform name. Different vertex/fragment
  // aliases consume two combined texture units even when they bind one image.
  shader.vertexShader=shader.vertexShader.replaceAll('uTerrainUnderlay','uReferenceUnderlay');
  shader.fragmentShader=shader.fragmentShader.replace('uSourceSlots,uTerrainUnderlay,uSourceDisplacementMask','uSourceSlots,uSourceDisplacementMask')
   .replaceAll('uTerrainUnderlay','uReferenceUnderlay')
   .replace('float baseHeight=texture2D(uReferenceLightHeight,heightUV).r;','float baseHeight=terrainHeight(vReferenceSurfaceXZ);')
   .replaceAll('texture2D(uReferenceLightHeight,heightUV).g','texture2D(uSourceHeight,heightUV).g');
  // Source Terrain.fx applies displacement AO before default ambient lighting.
  shader.fragmentShader=shader.fragmentShader.replace('float sourceAO=1.;',`float sourceAO=mix(1.,.5+clamp(terrainDisplacement(vSourcePosition.xz).a/.6,0.,1.)*.5,terrainDisplacementMask(vSourceDisplaced.xz));`);
 }
 dispose(){this.disposed=true;this.ar.value.dispose();this.nh.value.dispose();this.masks.dispose();this.slots.dispose();this.displacement.value.dispose();this.displacementMask.dispose();this.macro.dispose();this.ground.dispose();}
}
