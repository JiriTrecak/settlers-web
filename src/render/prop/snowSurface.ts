import {RepeatWrapping,SRGBColorSpace,TextureLoader,type MeshStandardMaterial} from 'three';
import {assetUrls} from '../../shared/assets/urls.generated';
let texture:ReturnType<TextureLoader['load']>|undefined;
/** Directional snow on shared source meshes: upward faces collect, trunks stay readable.
 * A material variant keeps source geometry, wind metadata and harvest animations intact. */
export function prepareSnowSurface(material:MeshStandardMaterial){
 if(!material.userData.snowSurface)return;
 texture??=new TextureLoader().load(assetUrls['assets/library/asset.terrain.winter-soil/albedo.png']);
 texture.wrapS=texture.wrapT=RepeatWrapping;texture.colorSpace=SRGBColorSpace;
 const previous=material.onBeforeCompile,key=material.customProgramCacheKey.bind(material);
 material.onBeforeCompile=(s,r)=>{
  previous.call(material,s,r);s.uniforms.uCanopySnow={value:texture};
  s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vSnowNormal;varying vec2 vSnowPosition;')
   .replace('#include <project_vertex>',`#include <project_vertex>
    vSnowNormal=normalize(inverseTransformDirection(transformedNormal,viewMatrix));
    vSnowPosition=(transpose(mat3(viewMatrix))*mvPosition.xyz+cameraPosition).xz;
   `);
  s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D uCanopySnow;varying vec3 vSnowNormal;varying vec2 vSnowPosition;')
   .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
    vec4 snow=texture2D(uCanopySnow,vSnowPosition*.22);
    float cap=smoothstep(.18,.72,normalize(vSnowNormal).y)*(.78+.22*snow.r);
    ${material.userData.foliage?`#ifdef USE_MAP
     // Preserve the bough atlas' dark branch recesses beneath the snow cap.
     float boughLight=dot(sampledDiffuseColor.rgb,vec3(.2126,.7152,.0722));
     cap*=mix(.28,.94,smoothstep(.012,.12,boughLight));
    #endif`:''}
    diffuseColor.rgb=mix(diffuseColor.rgb,snow.rgb,cap);
    roughnessFactor=mix(roughnessFactor,.92,cap);
   `);
 };
 material.customProgramCacheKey=()=>key()+'/directional-snow-2-'+!!material.userData.foliage;material.needsUpdate=true;
}
