import {sourceOcclusionGLSL} from '../prop/sourceOcclusion';
import type {WebGLProgramParametersWithUniforms} from 'three';

/** Grass.fxs + Base.fxh PERVERTEX_LIGHTING. Grass uses a white, roughness-one
 * dielectric in the vertex stage; texture/macro color and shadows follow in PS.
 * Dynamic lights and the source's generated occlusion/bounce maps are separate. */
export function sourceGrassLighting(s:WebGLProgramParametersWithUniforms,useGround:boolean,slopeLaying=false){
 const varyings='varying vec3 vGrassDirectDiffuse,vGrassDirectSpecular,vGrassAmbientDiffuse,vGrassAmbientSpecular;';
 s.vertexShader=s.vertexShader.replace('#include <common>',`#include <common>
  ${varyings}
  uniform sampler2D uReferenceUnderlay;
  ${sourceOcclusionGLSL}
  uniform sampler2D uReferenceLightHeight;uniform vec4 uReferenceLightLayout;uniform vec2 uReferenceLightDimensions;
  uniform vec3 uGrassSunColor,uGrassSunDirection,uGrassAmbient;
  uniform samplerCube uReferenceReflection;
  uniform sampler2D uReferenceBrdf,uReferenceColor;
  uniform vec4 uReferenceColorLayout;
 `).replace('#include <fog_vertex>',`#include <fog_vertex>
  vec3 grassWorld=transpose(mat3(viewMatrix))*mvPosition.xyz+cameraPosition;
  // Instance scale affects positions only in Grass.fxs. Preserve the authored
  // terrain-normal interpolation instead of applying an inverse-transpose.
  vec3 N=mat3(modelMatrix)*mat3(instanceMatrix)*objectNormal/length(instanceMatrix[0].xyz);
  ${slopeLaying?`vec2 anchor=instanceMatrix[3].xz;
  float h00=referenceHeight(anchor-vec2(1./6.)),h10=referenceHeight(anchor+vec2(1./6.,-1./6.)),h01=referenceHeight(anchor+vec2(-1./6.,1./6.));
  vec3 up=mix(normalize(vec3((h00-h10)/(8./49.),2.,(h00-h01)/(8./49.))),vec3(0.,1.,0.),.5);
  vec3 right=normalize(instanceMatrix[2].xyz),tangent=normalize(cross(up,right));
  N=mat3(modelMatrix)*mat3(tangent,up,cross(tangent,up))*objectNormal;`:''}
  vec3 V=normalize(cameraPosition-grassWorld),L=uGrassSunDirection,H=normalize(V+L);
  float noV=abs(dot(N,V))+1e-5,noL=clamp(dot(N,L),0.,1.),hoV=clamp(dot(H,V),0.,1.);
  vec3 albedo=vec3(1.);
  ${useGround?'albedo*=texture2D(uReferenceColor,(grassWorld.xz-uReferenceColorLayout.xy)*uReferenceColorLayout.zw).rgb*2.;':''}
  float fresnel=.04+.96*pow(1.-hoV,5.);
  float visibility=(noV/(noV*.5+.5))*(noL/(noL*.5+.5));
  vGrassDirectDiffuse=uGrassSunColor*albedo*(1.-fresnel)*noL/PI;
  vGrassDirectSpecular=uGrassSunColor*(1./PI)*visibility*fresnel*noL/(4.*noV*noL+1e-5);
  vec3 irradiance=sqrt(textureLod(uReferenceReflection,N,6.).rgb);
  vec2 aoHeightUV=((grassWorld.xz-uReferenceLightLayout.xy)*uReferenceLightLayout.zw+.5)/uReferenceLightDimensions;
  float grassAO=referenceOcclusion(grassWorld,dot(texture2D(uReferenceLightHeight,aoHeightUV).rg,vec2(1.,8.)),0.,true);
  irradiance=mix(sqrt(textureLod(uReferenceReflection,vec3(0.,-1.,0.),6.).rgb),irradiance,grassAO)*grassAO;
  vGrassAmbientDiffuse=uGrassAmbient*.96*albedo*irradiance;
  vec2 brdf=texture2D(uReferenceBrdf,vec2(noV,0.)).rg;
  vGrassAmbientSpecular=uGrassAmbient*textureLod(uReferenceReflection,-reflect(V,N),8.).rgb*(.04*brdf.x+brdf.y)*max(.1,grassAO*grassAO);
 `);
 s.fragmentShader=s.fragmentShader.replace('#include <common>',`#include <common>\n${varyings}`)
  .replace('#include <lights_physical_fragment>','')
  .replace('#include <lights_fragment_maps>','')
  .replace('#include <lights_fragment_end>','')
  .replace('#include <aomap_fragment>','')
  .replace('#include <lights_fragment_begin>',`
   float grassShadow=1.;
   #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
    DirectionalLightShadow grassSunShadow=directionalLightShadows[0];
    if(receiveShadow)grassShadow=getShadow(directionalShadowMap[0],grassSunShadow.shadowMapSize,grassSunShadow.shadowIntensity,grassSunShadow.shadowBias,grassSunShadow.shadowRadius,vDirectionalShadowCoord[0]);
   #endif
   reflectedLight.directDiffuse=diffuseColor.rgb*vGrassDirectDiffuse*grassShadow;
   reflectedLight.indirectDiffuse=diffuseColor.rgb*vGrassAmbientDiffuse;
   reflectedLight.directSpecular=vGrassDirectSpecular*grassShadow;
   reflectedLight.indirectSpecular=vGrassAmbientSpecular;
  `);
}
