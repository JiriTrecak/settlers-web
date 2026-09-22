import {ShaderChunk,type WebGLProgramParametersWithUniforms} from 'three';

/** Lighting.fxh::AddDirectionalLightGGX. Keep this branch confined to imported
 * source scenes; Three's native material path remains available on other maps.
 * Three supplies radiance with shadow attenuation before RE_Direct is called. */
export function sourceDirectLight(shader:WebGLProgramParametersWithUniforms){
 const marker='void RE_Direct_Physical(';
 const chunk=ShaderChunk.lights_physical_pars_fragment;
 const start=chunk.indexOf(marker),body=chunk.indexOf('{',start);
 if(start<0||body<0)throw Error('Three direct-light shader interface changed');
 const direct=`
 {
  vec3 N=geometryNormal,V=geometryViewDir,L=directLight.direction,H=normalize(V+L);
  float noV=abs(dot(N,V))+1e-5,noH=clamp(dot(N,H),0.,1.),hoV=clamp(dot(H,V),0.,1.);
  float backside=0.; // SOURCE_BACKSIDE
  float noL=mix(clamp(dot(N,L),0.,1.),1.,backside);
  float r=max(material.roughness,.001),a2=r*r*r*r;
  float d=(noH*a2-noH)*noH+1.;
  float distribution=min(a2/(PI*d*d),32.);
  float k=(r+1.)*(r+1.)/8.;
  float visibility=(noV/(noV*(1.-k)+k))*(noL/(noL*(1.-k)+k));
  vec3 f0=mix(vec3(.04),material.diffuseColor,material.metalness);
  vec3 fresnel=f0+(1.-f0)*pow(1.-hoV,5.);
  vec3 remappedAlbedo=material.diffuseColor*(1.-material.metalness);
  reflectedLight.directDiffuse+=directLight.color*remappedAlbedo*(1.-fresnel)*(1.-material.metalness)*noL/PI;
  float sourceSpecularMultiplier=1.; // SOURCE_SPECULAR_MULTIPLIER
  reflectedLight.directSpecular+=directLight.color*distribution*visibility*fresnel*noL/(4.*noV*noL+1e-5)*sourceSpecularMultiplier;
  return;
 }
 `;
 shader.fragmentShader=shader.fragmentShader
  .replace('#include <lights_physical_pars_fragment>',chunk.slice(0,body+1)+direct+chunk.slice(body+1))
  .replace('#include <lights_physical_fragment>',`#include <lights_physical_fragment>
   // Source uses authored roughness with a .001 floor, without derivative AA.
   material.roughness=max(roughnessFactor,.001);
  `);
}
