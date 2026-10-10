import {terrainTileArray as tileArray} from './terrainTileArray';
import {terrainMaskBytes,sameTerrainMask} from './terrainMasks';
import {terrainTexturePalette,reuseTerrainTexturePalette,type TerrainTexturePalette} from './terrainTexturePalette';
import {terrainLayerTable} from './terrainLayerTable';
import {sourceTerrainGLSL} from './sourceTerrainShader';
import {DataArrayTexture,DataTexture,FloatType,LinearFilter,NearestFilter,RGBAFormat,Vector2,type WebGLProgramParametersWithUniforms} from 'three';
import {groundTextures} from '../../shared/authoring/groundTextures';
import {unpackSourceBytes,sourceHeight,type ImportedTerrain} from '../../shared/map/importedTerrain';
import {ReferenceGround} from '../prop/referenceGround';
import {referenceTexture,macroUrl} from './referenceTerrain';
import {assetUrls} from '../../shared/assets/urls.generated';
export class ImportedTerrainMaterial {
 readonly ready:Promise<void>;
 private disposed=false;
 private ar={value:new DataArrayTexture(new Uint8Array([128,128,128,255]),1,1,1)};
 private nh={value:new DataArrayTexture(new Uint8Array([128,128,255,128]),1,1,1)};
 private om={value:new DataArrayTexture(new Uint8Array([255,0,0,255]),1,1,1)};
 private displacement={value:new DataArrayTexture(new Uint8Array([128,128,255,64]),1,1,1)};
 private readonly displacementAsset:string|undefined;
 private masks:DataArrayTexture;
 private slots:DataTexture;
 private palette:TerrainTexturePalette;
 private macro=referenceTexture(macroUrl,false);
 private ground=new ReferenceGround();
 private currentSource:ImportedTerrain;
 get source(){return this.currentSource;}
 constructor(source:ImportedTerrain){
  this.currentSource=source;this.displacementAsset=source.displacement?.texture;
  if(source.layers.some(l=>l.ar.startsWith('asset.terrain.winter-'))){this.macro.dispose();this.macro=referenceTexture(assetUrls['assets/library/asset.texture.winter-macro/albedo.png'],false);}
  this.ground.updateSource(sourceHeight(source));
  this.displacement.value.needsUpdate=true;
  const [w,h]=source.maskSize,maskData=new Uint8Array(w*h*source.layers.length*4);
  source.layers.forEach((_,i)=>this.writeMask(maskData,source,i));
  this.writeDisplacement(maskData,source);
  this.masks=new DataArrayTexture(maskData,w,h,source.layers.length);this.masks.format=RGBAFormat;this.masks.minFilter=this.masks.magFilter=LinearFilter;this.masks.needsUpdate=true;
  this.palette=terrainTexturePalette(source);
  const table=terrainLayerTable(source,this.palette);
  this.slots=new DataTexture(table.data,table.width,table.height,RGBAFormat,FloatType);
  this.slots.minFilter=this.slots.magFilter=NearestFilter;this.slots.needsUpdate=true;
  this.ar.value.needsUpdate=this.nh.value.needsUpdate=this.om.value.needsUpdate=true;
  this.ready=Promise.all([tileArray(this.palette.names.ar,true),tileArray(this.palette.names.nh,false),this.ground.ready,source.displacement?tileArray([source.displacement.texture],false):Promise.resolve(undefined),this.macro.referenceReady,this.palette.names.om.length?tileArray(this.palette.names.om,false,'om'):Promise.resolve(undefined)]).then(([ar,nh,,displacement,,om])=>{
   if(this.disposed){ar.dispose();nh.dispose();om?.dispose();displacement?.dispose();return;}this.ar.value.dispose();this.nh.value.dispose();this.om.value.dispose();this.ar.value=ar;this.nh.value=nh;if(om)this.om.value=om;
   if(displacement){this.displacement.value.dispose();this.displacement.value=displacement;}
  });
 }
 /** Base-mask alpha shares the exact grid and filtering of displacement coverage.
  * Packing it here leaves a texture unit for gameplay fog on 16-sampler GPUs. */
 private writeDisplacement(data:Uint8Array,source:ImportedTerrain){
  const bytes=terrainMaskBytes(source.displacement),count=source.maskSize[0]*source.maskSize[1];
  for(let i=0;i<count;i++)data[i*4+3]=bytes?.[i]??0;
 }
 private writeMask(data:Uint8Array,source:ImportedTerrain,layerIndex:number){
  const [w,h]=source.maskSize,layer=source.layers[layerIndex],bytes=terrainMaskBytes(layer),codes=layer.connections?unpackSourceBytes(layer.connections):undefined,cells=source.blocks[0]*4;
  const variants=layer.variants?unpackSourceBytes(layer.variants):undefined,fullTiles=groundTextures.get(layer.ar)?.terrain?.atlas.fullTiles;
  for(let z=0;z<h;z++)for(let x=0;x<w;x++){
   const i=z*w+x,to=(layerIndex*w*h+i)*4;
   data[to]=bytes?.[i]??(layerIndex===0?255:0);
   const cx=Math.max(0,Math.min(cells-1,Math.floor((x+.5)/4))),cz=Math.max(0,Math.min(source.blocks[1]*4-1,Math.floor((z+.5)/4)));
   data[to+1]=codes?.[cz*cells+cx]??0;
   data[to+2]=fullTiles?.[(variants?.[cz*cells+cx]??0)%(fullTiles?.length??1)]??0;
  }
 }
 /** Editable terrain changes masks far more often than its biome tiles. Keep the
  * loaded arrays (and pending loads) alive across compatible edits. Different
  * assets/layouts require a new owner so an old async load cannot overwrite them. */
 update(source:ImportedTerrain):boolean {
  const previous=this.source;
  const pair=(a:readonly number[],b:readonly number[])=>a[0]===b[0]&&a[1]===b[1];
  if(this.disposed||!pair(previous.maskSize,source.maskSize)||!pair(previous.blocks,source.blocks)||
   previous.layers.length!==source.layers.length||previous.layers.some((l,i)=>l.ar!==source.layers[i]!.ar||l.nh!==source.layers[i]!.nh)||
   (source.displacement&&source.displacement.texture!==this.displacementAsset))return false;
  const palette=reuseTerrainTexturePalette(terrainTexturePalette(source),this.palette);
  if(!palette)return false;
  const data=this.masks.image.data as Uint8Array;
  let dirty=false;
  source.layers.forEach((layer,i)=>{
   if(sameTerrainMask(layer,previous.layers[i])&&layer.connections===previous.layers[i]?.connections&&layer.variants===previous.layers[i]?.variants)return;
   this.writeMask(data,source,i);
   dirty=true;
  });
  if(dirty)this.masks.needsUpdate=true;
  if(!sameTerrainMask(source.displacement,previous.displacement)){
   this.writeDisplacement(data,source);
   this.masks.needsUpdate=true;
  }
  const table=terrainLayerTable(source,palette),slots=this.slots.image.data as Float32Array;
  if(table.data.some((value,i)=>value!==slots[i])){slots.set(table.data);this.slots.needsUpdate=true;}
  if(source.height!==previous.height||source.heightOffset!==previous.heightOffset||source.heightSamplesPerUnit!==previous.heightSamplesPerUnit||
   !pair(source.heightSize,previous.heightSize)||!pair(source.origin,previous.origin)||!pair(source.sourceOrigin,previous.sourceOrigin)||
   source.source!==previous.source||source.groundColor!==previous.groundColor||source.underlayMask!==previous.underlayMask||source.occlusion!==previous.occlusion)
   this.ground.updateSource(sourceHeight(source));
  this.palette=palette;this.currentSource=source;
  return true;
 }
 private uniforms(shader:WebGLProgramParametersWithUniforms){
  const s=this.source;
  Object.assign(shader.uniforms,{uSourceOM:this.om,uSourceAllLayers:{value:s.source==='authored-layered'?1:0},uSourceMetadataOffset:{value:s.blocks[0]*8*s.blocks[1]*4}});
  Object.assign(shader.uniforms,{uSourceHeightScale:{value:s.heightSamplesPerUnit??3},uSourceAR:this.ar,uSourceNH:this.nh,uSourceMasks:{value:this.masks},uSourceSlots:{value:this.slots},uSourceMacro:{value:this.macro},uTerrainUnderlay:this.ground.underlay,uSourceHeight:this.ground.texture,uSourceHeightSize:{value:new Vector2(...s.heightSize)},uSourceDisplacement:this.displacement,uSourceHasDisplacement:{value:s.displacement?1:0},uSourceDisplacementTiling:{value:s.displacement?.tiling??1},uSourceOrigin:{value:new Vector2(...s.origin)},uSourceOffset:{value:new Vector2(s.origin[0]-s.sourceOrigin[0],s.origin[1]-s.sourceOrigin[1])},uSourceSize:{value:new Vector2(s.blocks[0]*16,s.blocks[1]*16)}});
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
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+sourceTerrainGLSL(this.source.layers.length,true)+'\nvarying vec3 vSourcePosition,vSourceDisplaced;uniform sampler2D uSourceMacro;')
   .replace('#include <map_fragment>',`
    vec3 sourceBaseNormal=terrainNormal(vSourceDisplaced.xz);
    vec4 sourceAR,sourceNH;terrainLayers(vSourcePosition.xz,sourceBaseNormal.y,sourceAR,sourceNH);
    diffuseColor.rgb*=sourceAR.rgb*texture2D(uSourceMacro,(vSourcePosition.xz-uSourceOffset)*.01).rgb*2.;
   `).replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=sourceAR.a;')
   .replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor=terrainSurfaceOM.y;')
   .replace('#include <aomap_fragment>','#include <aomap_fragment>\nreflectedLight.indirectDiffuse*=terrainSurfaceOM.x;')
   .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
    normal=normalize(mat3(viewMatrix)*terrainBasis(sourceBaseNormal)*(2.*(sourceNH.rgb-.50196)*vec3(1.,1.,.55)));
   `);
  // Terrain.fx defines FORCE_LIGHTMAP_OCCLUSION_LEVEL0: no ground-color bounce.
  this.ground.compileSurface(shader,this.macro,false,false,false);
  // Both stages must use the same uniform name. Different vertex/fragment
  // aliases consume two combined texture units even when they bind one image.
  shader.vertexShader=shader.vertexShader.replaceAll('uTerrainUnderlay','uReferenceUnderlay');
  shader.fragmentShader=shader.fragmentShader.replace('uSourceSlots,uTerrainUnderlay,uSourceHeight','uSourceSlots,uSourceHeight')
   .replaceAll('uTerrainUnderlay','uReferenceUnderlay')
   .replace('float baseHeight=texture2D(uReferenceLightHeight,heightUV).r;','float baseHeight=terrainHeight(vReferenceSurfaceXZ);')
   .replaceAll('texture2D(uReferenceLightHeight,heightUV).g','texture2D(uSourceHeight,heightUV).g');
  // Source Terrain.fx applies displacement AO before default ambient lighting.
  shader.fragmentShader=shader.fragmentShader.replace('float sourceAO=1.;',`float sourceAO=mix(1.,.5+clamp(terrainDisplacement(vSourcePosition.xz).a/.6,0.,1.)*.5,terrainDisplacementMask(vSourceDisplaced.xz));`);
 }
 dispose(){this.disposed=true;this.ar.value.dispose();this.nh.value.dispose();this.om.value.dispose();this.masks.dispose();this.slots.dispose();this.displacement.value.dispose();this.macro.dispose();this.ground.dispose();}
}
