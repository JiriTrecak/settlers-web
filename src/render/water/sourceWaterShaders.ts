import {sourceWavesGLSL} from './sourceWaves';

const common=`
uniform float uSourceWaterTime;
uniform sampler2D uSourceWaterFlow,uSourceWaterGround,uSourceWaterWaves;
uniform vec2 uSourceWaterOrigin,uSourceWaterSize,uSourceWaterOffset,uSourceWaterGroundSize;
uniform float uSourceWaterGroundScale;
uniform sampler2D uWaterProfiles;uniform bool uAuthoredWater;
vec4 waterProfile(vec2 world,float row){
 ivec2 cell=ivec2(clamp(floor(world-uSourceWaterOrigin),vec2(0.),uSourceWaterSize-1.));
 float index=max(1.,floor(texelFetch(uSourceWaterFlow,cell,0).a*255.+.5));
 return texture2D(uWaterProfiles,vec2((index+.5)/256.,(row+.5)/4.));
}
${sourceWavesGLSL}
float sourceGround(vec2 p){
 vec2 size=uSourceWaterGroundSize,q=clamp((p-uSourceWaterOrigin)*uSourceWaterGroundScale,vec2(0.),size-1.),i=floor(q),f=fract(q),uv=(i+.5)/size,d=1./size;
 return mix(mix(texture2D(uSourceWaterGround,uv).r,texture2D(uSourceWaterGround,uv+vec2(d.x,0.)).r,f.x),mix(texture2D(uSourceWaterGround,uv+vec2(0.,d.y)).r,texture2D(uSourceWaterGround,uv+d).r,f.x),f.y);
}
uniform samplerCube uReflectionCube;
uniform sampler2D uSourceWaterGroundColor;
uniform vec3 uDirectLight,uAmbientLight,uSunDirection;
uniform bool uUseGroundColor;
varying vec3 vSourceWater,vSourceDirect,vSourceAmbient;
`;

export const sourceWaterVertex=`
${common}
void main(){
 vec3 waveNormal;float foamHeight;
 float displacement=sourceWaves(position,true,waveNormal,foamHeight);
 vec4 flow=texture2D(uSourceWaterFlow,(position.xz-uSourceWaterOrigin)/uSourceWaterSize);
 displacement+=clamp(flow.b*2.-.25,0.,1.)*foamHeight;
 float depth=position.y-sourceGround(position.xz);
 displacement=mix(displacement,max(displacement,-depth+.05),clamp(depth/.05,0.,1.));
 vec3 p=position;p.y+=displacement;p.xz-=waveNormal.xz*.5*(1.-foamHeight);
 // Source samples material maps at the undisplaced XZ coordinates.
 vSourceWater=vec3(position.x,p.y,position.z);
 // Water.fxs evaluates DoDefaultLighting on an upward, white dielectric
 // in the domain stage; the fragment waves only modulate that base lighting.
 vec3 eye=normalize(cameraPosition-p),halfLight=normalize(eye+uSunDirection);
 float f=.04+.96*pow(1.-clamp(dot(halfLight,eye),0.,1.),5.);
 vSourceDirect=uDirectLight*(1.-f); // uDirectLight already contains 1/pi.
 float ndv=abs(eye.y)+1e-5;
 float fresnel=.04+(pow(1.-.001,2.)-.04)*exp2((-5.55473*ndv-6.98316)*ndv);
 vec3 irradiance=sqrt(textureLod(uReflectionCube,vec3(0.,1.,0.),6.).rgb);
 if(uUseGroundColor){
  vec3 tint=texture2D(uSourceWaterGroundColor,(p.xz-uSourceWaterOrigin)/uSourceWaterSize).rgb*4.8;
  float fade=1.-clamp((p.y-sourceGround(p.xz))/8.,0.,1.);
  irradiance*=mix(vec3(1.),mix(vec3(1.),tint,fade),.25);
 }
 vSourceAmbient=uAmbientLight*(1.-fresnel)*irradiance;
 gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
 // UTC_VISIBILITY_VERTEX
}
`;

/** Supplied Water.fxs composition, with depth-checked screen refraction.
 * Dynamic disturbance simulation remains separate. */
export const sourceWaterFragment=`
#include <common>
#include <packing>
#include <shadowmap_pars_fragment>
${common}
uniform sampler2D uOpaqueColor,uOpaqueDepth,uSourceCaustics,uSourceReflections;
uniform vec2 uViewport,uShadowSize;
uniform mat4 uInverseProjection,uCameraWorld,uShadowMatrix,uCausticsView;
uniform vec3 uViewDirection;
uniform bool uHasShadow;
uniform float uShadowBias,uShadowRadius,uSourceHeightOffset;
#ifdef SHADOWMAP_TYPE_PCF
uniform highp sampler2DShadow uSunShadow;
#else
uniform sampler2D uSunShadow;
#endif
vec3 worldAt(vec2 uv){
 vec4 p=uInverseProjection*vec4(uv*2.-1.,texture2D(uOpaqueDepth,uv).r*2.-1.,1.);
 return (uCameraWorld*vec4(p.xyz/p.w,1.)).xyz;
}
void main(){
 vec2 screenUV=gl_FragCoord.xy/uViewport;
 float groundDepth=vSourceWater.y-sourceGround(vSourceWater.xz);
 if(groundDepth<.005)discard;
 vec4 map=texture2D(uSourceWaterFlow,(vSourceWater.xz-uSourceWaterOrigin)/uSourceWaterSize);
 vec3 normal;float foam;float waveAlpha=sourceWaves(vSourceWater,false,normal,foam);
 vec3 original=worldAt(screenUV),toEye=normalize(cameraPosition-vSourceWater);
 // Avoid sampling foreground bridges/units into the river when bending the view.
 vec2 extra=2.*(texture2D(uSourceWaterWaves,(vSourceWater.xz-uSourceWaterOffset)*.05).rg-.50196);
 vec3 distortion=(viewMatrix*vec4(normal.x+extra.x*.15,0.,normal.z+extra.y*.15,0.)).xyz;
 vec2 refrOffset=vec2(distortion.x,distortion.z)*.2;refrOffset.y+=waveAlpha*.1; // GL UV Y is opposite to the source D3D screen Y.
 float viewDepth=max(dot(original-vSourceWater,uViewDirection),0.);
 float offsetDepth=dot(worldAt(clamp(screenUV+refrOffset,vec2(.001),vec2(.999)))-vSourceWater,uViewDirection);
 refrOffset*=sqrt(clamp(min(viewDepth*.1,offsetDepth)*.5,0.,1.));
 vec2 refrUV=clamp(screenUV+refrOffset,vec2(.001),vec2(.999));
 vec3 refrWorld=worldAt(refrUV);
 if(refrWorld.y>vSourceWater.y){refrUV=screenUV;refrWorld=original;}
 float depth=max(dot(refrWorld-vSourceWater,uViewDirection),0.)/max(dot(-toEye,uViewDirection),1e-5);
 float soft=clamp(depth*2.,0.,1.);
 float shadow=1.;
 if(uHasShadow)shadow=getShadow(uSunShadow,uShadowSize,1.,uShadowBias,uShadowRadius,uShadowMatrix*vec4(vSourceWater+vec3(normal.x,0.,normal.z)*.5,1.));
 vec3 lighting=vSourceDirect*shadow*clamp(1.-dot(normal,toEye),0.,1.)+vSourceAmbient;
 // XML blue preset; colors decoded from sRGB and multiplied by their HDR scalar.
 vec4 shallow=waterProfile(vSourceWater.xz,0.),deep=waterProfile(vSourceWater.xz,1.),effects=waterProfile(vSourceWater.xz,2.);
 vec3 water=(uAuthoredWater?mix(shallow.rgb,deep.rgb,clamp(groundDepth/max(.2,shallow.a),0.,1.))*.22:vec3(.00933,.01409,.01998))*lighting;
 vec3 foamColor=vec3(.1)*(.5+foam)*lighting;
 vec3 rawRefraction=texture2D(uOpaqueColor,refrUV).rgb;
 vec3 refraction=rawRefraction;
 refraction*=uAuthoredWater?mix(vec3(1.),mix(vec3(.4),shallow.rgb,.6),clamp(depth/max(.2,shallow.a),0.,1.)):mix(vec3(1.),vec3(.17874,.09982,.04761),clamp(depth/6.+.2,0.,1.));
 float transmission=clamp(exp(-depth/(uAuthoredWater?max(.2,shallow.a):3.))*.8,0.,1.);
 vec3 reflectionDir=-normalize(vec3(normalize(uViewDirection.xz).x,-1.,normalize(uViewDirection.xz).y));
 vec3 reflected=textureCube(uReflectionCube,-reflect(reflectionDir,normal)).rgb;
 vec3 reflectedDistortion=(viewMatrix*vec4(normal.x+extra.x*.05,0.,normal.z+extra.y*.05,0.)).xyz;
 // Both source view-Z and screen-Y flip when translating its offset to GL.
 vec2 reflectionOffset=vec2(reflectedDistortion.z,-reflectedDistortion.x)*.25;
 vec4 screenReflection=texture2D(uSourceReflections,screenUV+reflectionOffset);
 reflected=mix(reflected,screenReflection.rgb,screenReflection.a);
 if(uAuthoredWater)reflected*=deep.a/.45;
 reflected*=clamp(.02+.2*pow(1.-dot(normal,reflectionDir),2.),0.,1.);
 vec2 flow=2.*(map.rg-.50196)*(1.-map.b*.6);
 float causticsLod=(1.+5.*clamp(1.-length(flow)/.25,0.,1.))*groundDepth*.5;
 vec3 sourcePoint=original-vec3(uSourceWaterOffset.x,uSourceHeightOffset,uSourceWaterOffset.y);
 vec2 causticsUV=(uCausticsView*vec4(sourcePoint,1.)).xy*.1+normal.xz*.2;
 vec3 caustics=textureLod(uSourceCaustics,causticsUV,causticsLod).rgb*clamp(1.-groundDepth*.25,0.,1.)*.75;
 caustics*=refraction*(vSourceAmbient+vSourceDirect*shadow)*soft*.5;
 if(uAuthoredWater)caustics*=effects.b/.3;
 vec3 finalColor=mix(water,refraction+caustics,transmission)+reflected;
 // Source's narrow view-aligned glint, independent of the opaque GGX material.
 vec3 specularDir=-normalize(vec3(normalize(uViewDirection.xz).x,16.,normalize(uViewDirection.xz).y));
 vec3 halfVector=normalize(toEye-specularDir);
 finalColor+=vSourceDirect*shadow*(1.-map.b)*smoothstep(.02,.25,length(uViewDirection.xz))*1.024*pow(max(0.,dot(normalize(normal*vec3(1.,.5,1.)),halfVector)),512.);
 float foamMix=clamp(map.b*foam*4.-(1.-map.b)*.5,0.,1.);
 finalColor=mix(finalColor,mix(rawRefraction,foamColor,soft),foamMix);
 if(uAuthoredWater){float clouds=waterProfile(vSourceWater.xz,3.).r;finalColor*=1.-clouds*(.5+.5*sin(vSourceWater.x*.07+vSourceWater.z*.04+uSourceWaterTime*.04));}
 gl_FragColor=vec4(finalColor,1.);
 // UTC_VISIBILITY_FRAGMENT
}
`;
