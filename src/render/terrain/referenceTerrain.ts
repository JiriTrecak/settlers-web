import {TextureLoader,RepeatWrapping,SRGBColorSpace,type WebGLProgramParametersWithUniforms,type Texture,type Color} from 'three';
import albedoUrl from '../../../assets/library/asset.unregistered.textures.reference.scouring.terrain-ar.png/albedo.png?url';
import normalUrl from '../../../assets/library/asset.unregistered.textures.reference.scouring.terrain-nh.png/albedo.png?url';
import macroUrl from '../../../assets/library/asset.unregistered.textures.reference.scouring.env_macro_color__d.png/albedo.png?url';
import {HEIGHT_ORIGIN} from '../../shared';
export function referenceTexture(url:string,color=true):Texture & {referenceReady:Promise<void>} {
 let resolve!:()=>void,reject!:(reason:unknown)=>void;
 const referenceReady=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});
 // Callers that await readiness still receive failures. Legacy texture consumers
 // rely on the loader's own error reporting and must not create unhandled promises.
 void referenceReady.catch(()=>{});
 const t=new TextureLoader().load(url,()=>resolve(),undefined,reject);if(color)t.colorSpace=SRGBColorSpace;
 t.flipY=false;t.wrapS=t.wrapT=RepeatWrapping;t.anisotropy=8;
 return Object.assign(t,{referenceReady});
}
export {macroUrl};
export class ReferenceTerrain {
 readonly ar=referenceTexture(albedoUrl);
 readonly nh=referenceTexture(normalUrl,false);
 readonly macro=referenceTexture(macroUrl,false);
 compile(shader:WebGLProgramParametersWithUniforms,inputs:{paint:Texture;cover:Texture;contacts:Texture;season:{value:Color};sea:{value:number};verts:number}){
  const {paint,cover,contacts,season,sea,verts}=inputs;
  Object.assign(shader.uniforms,{uReferenceAR:{value:this.ar},uReferenceNH:{value:this.nh},uReferenceMacro:{value:this.macro},uPaint:{value:paint},uRoadMask:{value:cover},uContact:{value:contacts},uSoilTint:season,uSea:sea});
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vTerrain; varying vec3 vTerrainNormal;')
   .replace('#include <begin_vertex>','#include <begin_vertex>\nvTerrain=position; vTerrainNormal=normal;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
   varying vec3 vTerrain; varying vec3 vTerrainNormal;
   uniform sampler2D uReferenceAR,uReferenceNH,uReferenceMacro,uPaint,uRoadMask,uContact;
   uniform vec3 uSoilTint; uniform float uSea;
   float refHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   float refNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(refHash(i),refHash(i+vec2(1,0)),f.x),mix(refHash(i+vec2(0,1)),refHash(i+vec2(1)),f.x),f.y);}
   vec4 refTile(sampler2D tex,vec2 uv,vec2 tile){
    vec2 inset=vec2(.5/1024.);vec2 at=(tile+mix(inset,1.-inset,fract(uv)))*.5;
    return textureGrad(tex,at,dFdx(uv)*.5,dFdy(uv)*.5);
   }
   void refBlend(inout vec4 ar,inout vec4 nh,vec4 layerAR,vec4 layerNH,float mask){
    if(mask<=0.)return;
    float k=clamp(((layerNH.a+.5)*mask-nh.a+.25)/.5,0.,1.);
    ar=mix(ar,layerAR,k);nh=mix(nh,layerNH,k);
   }
  `).replace('#include <map_fragment>',`
   vec2 mapUv=(vTerrain.xz-vec2(${HEIGHT_ORIGIN.toFixed(1)})+.5)/${verts.toFixed(1)};
   vec4 paint=texture2D(uPaint,mapUv);vec2 cover=texture2D(uRoadMask,mapUv).rg;
   vec2 uv=vTerrain.xz*.04;
   vec4 groundAR=refTile(uReferenceAR,uv*.8,vec2(1.,0.));
   vec4 groundNH=refTile(uReferenceNH,uv*.8,vec2(1.,0.));
   float colonies=refNoise(vTerrain.xz*.085)*.35+refNoise(vTerrain.xz*.25)*.35+refNoise(vTerrain.xz*.91)*.30;
   float grass=cover.g*(.12+.88*smoothstep(.30,.60,colonies))*(1.-max(max(paint.r,paint.g),max(paint.b,paint.a)))*(1.-cover.r);
   grass*=smoothstep(uSea+.15,uSea+.6,vTerrain.y);
   refBlend(groundAR,groundNH,refTile(uReferenceAR,uv,vec2(0.)),refTile(uReferenceNH,uv,vec2(0.)),grass);
   refBlend(groundAR,groundNH,refTile(uReferenceAR,uv,vec2(0.,1.)),refTile(uReferenceNH,uv,vec2(0.,1.)),paint.g);
   float cliff=smoothstep(.15,.5,1.-vTerrainNormal.y);
   refBlend(groundAR,groundNH,refTile(uReferenceAR,uv,vec2(1.)),refTile(uReferenceNH,uv,vec2(1.)),max(cliff,paint.b));
   groundAR.rgb=mix(groundAR.rgb,vec3(.78,.80,.83),paint.a);
   vec3 macro=texture2D(uReferenceMacro,vTerrain.xz*.02).rgb*2.;
   float contact=texture2D(uContact,(vTerrain.xz-vec2(${HEIGHT_ORIGIN.toFixed(1)}))/${(verts-1).toFixed(1)}).r;
   diffuseColor.rgb*=groundAR.rgb*4.5*macro*uSoilTint*(1.-contact);
  `).replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(groundAR.a,.35,1.);')
   .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
    vec3 n=normalize((groundNH.rgb*2.-1.)*vec3(1.,1.,.25));
    vec3 up=normalize(vTerrainNormal);
    vec3 tangent=normalize(vec3(up.y,-up.x,0.));
    vec3 bitangent=normalize(cross(tangent,up));
    normal=normalize(mat3(viewMatrix)*(tangent*n.x+bitangent*n.y+up*n.z));
   `);
 }
 dispose(){this.ar.dispose();this.nh.dispose();this.macro.dispose();}
}
