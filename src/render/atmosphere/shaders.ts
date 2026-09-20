export const fullscreenVertex=/* glsl */`
varying vec2 vUv;
void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}
`;
export const reconstruct=/* glsl */`
uniform sampler2D sceneDepth;
uniform mat4 inverseProjection, cameraWorld;
uniform float waterLevel;
vec3 worldAt(vec2 uv,float depth){
 vec4 v=inverseProjection*vec4(uv*2.-1.,depth*2.-1.,1.);
 return (cameraWorld*vec4(v.xyz/v.w,1.)).xyz;
}
vec3 surfaceAt(vec2 uv){
 vec3 p=worldAt(uv,texture2D(sceneDepth,uv).r);
 // Water is transparent and does not write depth: terminate in air at its plane.
 vec3 origin=worldAt(uv,0.);
 if(p.y<waterLevel&&origin.y>waterLevel)p=mix(origin,p,(origin.y-waterLevel)/(origin.y-p.y));
 return p;
}
`;
export const marchFragment=/* glsl */`
varying vec2 vUv;
${reconstruct}
uniform sampler2D visibilityMap;
#ifdef FILTERED_SHADOW
 uniform highp sampler2DShadow sunShadow;
#else
 uniform sampler2D sunShadow;
#endif
uniform mat4 shadowMatrix;
uniform bool hasShadow,hasVisibility;
uniform float mapSize,density,baseHeight,heightFalloff,sunStrength,noiseScale,noiseStrength,time,driftSpeed;
uniform vec2 wind;
uniform vec3 fogColor,sunColor,sunDirection;
uniform int regionCount;
uniform vec4 regions[16],regionShapes[16];
uniform highp sampler3D noiseVolume;
float noise3(vec3 p){
 vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return texture(noiseVolume,(i+f+.5)/32.).r;
}
float visibleAt(vec3 p){
 if(!hasVisibility)return 1.;
 vec2 uv=(p.xz+.5)/mapSize;
 if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))return 0.;
 return texture2D(visibilityMap,uv).r;
}
float sunlight(vec3 p){
 if(!hasShadow)return 0.;
 vec4 clip=shadowMatrix*vec4(p,1.);vec3 uv=clip.xyz/clip.w;
 if(any(lessThan(uv,vec3(0.)))||any(greaterThan(uv,vec3(1.))))return 0.;
 uv.z-=.00025;
 #ifdef FILTERED_SHADOW
  return texture(sunShadow,uv);
 #else
  // Three r185 VSM stores mean depth and standard deviation in RG.
  vec2 d=texture2D(sunShadow,uv.xy).rg;
  if(uv.z<=d.x)return 1.;
  float variance=max(d.y*d.y,.0000001),delta=uv.z-d.x;
  return clamp((variance/(variance+delta*delta)-.3)/.65,0.,1.);
 #endif
}
void main(){
 vec3 end=surfaceAt(vUv),origin=worldAt(vUv,0.);
 float revealed=visibleAt(end);
 if(revealed<.002||texture2D(sceneDepth,vUv).r>=.999999){gl_FragColor=vec4(0,0,0,1);return;}
 vec3 ray=normalize(end-origin);
 float lengthToSurface=length(end-origin);
 // Only integrate a bounded segment near visible terrain, independent of map size.
 float start=max(0.,lengthToSurface-96.);
 // Spend samples inside the mist layer, rather than in clear air above it.
 float ceiling=baseHeight+heightFalloff*5.;
 for(int r=0;r<16;r++){
  if(r>=regionCount)break;
  ceiling=max(ceiling,regions[r].y+regionShapes[r].y);
 }
 if(ray.y<-.001)start=max(start,(ceiling-origin.y)/ray.y);
 if(start>=lengthToSurface){gl_FragColor=vec4(0,0,0,1);return;}
 float stepSize=(lengthToSurface-start)/float(STEPS);
 float jitter=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
 float transmission=1.;vec3 scattered=vec3(0.);
 float phase=.65+.7*pow(max(0.,dot(ray,sunDirection)),4.);
 for(int i=0;i<STEPS;i++){
  vec3 p=origin+ray*(start+(float(i)+jitter)*stepSize);
  float amount=density*exp(-max(0.,p.y-baseHeight)/heightFalloff);
  for(int r=0;r<16;r++){
   if(r>=regionCount)break;
   float distance=length((p-regions[r].xyz)/regionShapes[r].xyz);
   amount+=regions[r].w*(1.-smoothstep(.25,1.,distance));
  }
  if(amount<.0001)continue;
  vec3 flow=vec3(wind.x,.08,wind.y)*time*driftSpeed;
  amount*=mix(1.,.25+1.5*noise3((p-flow)*noiseScale),noiseStrength);
  amount*=visibleAt(p);
  float extinction=1.-exp(-amount*stepSize);
  vec3 light=fogColor*.2+sunColor*(sunlight(p)*sunStrength*phase);
  scattered+=transmission*extinction*light;
  transmission*=1.-extinction;
 }
 gl_FragColor=vec4(scattered*revealed,mix(1.,transmission,revealed));
}
`;
/** Denoise only the low-resolution fog; preserve opaque depth discontinuities. */
export const filterFragment=/* glsl */`
varying vec2 vUv;
${reconstruct}
uniform sampler2D fogTexture;
uniform vec2 fogSize;
void main(){
 vec3 surface=surfaceAt(vUv);
 vec4 fog=vec4(0.);float sum=0.;
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
  vec2 uv=clamp(vUv+vec2(float(x),float(y))/fogSize,vec2(.5)/fogSize,vec2(1.)-vec2(.5)/fogSize);
  float spatial=(x==0?2.:1.)*(y==0?2.:1.);
  float weight=spatial*exp(-length(surfaceAt(uv)-surface)*1.5);
  fog+=texture2D(fogTexture,uv)*weight;sum+=weight;
 }
 gl_FragColor=fog/max(sum,.00001);
}
`;
export const compositeFragment=/* glsl */`
varying vec2 vUv;
${reconstruct}
uniform sampler2D sceneColor,fogTexture,visibilityMap;
#include <tonemapping_pars_fragment>
uniform vec2 fogSize;
uniform bool sourceReference,hasVolumetrics,hasDaytimeFog,hasVisibility;
uniform float mapSize,daytimeLutBlend;
uniform highp sampler3D daytimeLutFrom,daytimeLutTo;
uniform vec3 daytimeFogColor;
uniform float daytimeFogDensity,daytimeFogDispersion,daytimeFogStart,daytimeFogHeight;
// Common.fxh / ComputeFog, recovered from the supplied shader cache.
// Preserve the source's base-2 extinction and height integral (including epsilon).
float daytimeHeightIntegral(float scale,float low,float high){
 return scale>.00001?(exp(-scale*low)-exp(-scale*high))/scale:high-low;
}
float daytimeOpacity(vec3 surface){
 vec3 eye=cameraWorld[3].xyz;
 float distance=length(eye-surface),high=max(eye.y,surface.y),low=min(eye.y,surface.y);
 float upper1=max(high-daytimeFogHeight,0.),upper0=max(low-daytimeFogHeight,0.);
 float lower0=min(high-daytimeFogHeight,0.),lower1=min(low-daytimeFogHeight,0.);
 float integral=daytimeHeightIntegral(0.,-lower0,-lower1)+daytimeHeightIntegral(daytimeFogDispersion,upper0,upper1);
 integral*=daytimeFogDensity*max(distance-daytimeFogStart,0.)/(high-low+.00001);
 return 1.-exp2(-integral);
}
void main(){
 vec3 surface=surfaceAt(vUv);
 vec2 pixel=vUv*fogSize-.5,base=floor(pixel),f=fract(pixel);
 vec4 fog=vec4(0.,0.,0.,1.);float sum=0.;
 if(hasVolumetrics){fog=vec4(0.);
 for(int y=0;y<2;y++)for(int x=0;x<2;x++){
  vec2 offset=vec2(float(x),float(y));vec2 uv=(base+offset+.5)/fogSize;
  vec2 bilinear=mix(1.-f,f,offset);
  float distance=length(surfaceAt(uv)-surface);
  float weight=bilinear.x*bilinear.y*exp(-distance*1.5)+.00001;
  fog+=texture2D(fogTexture,uv)*weight;sum+=weight;
 }
 fog/=sum;
 }
 // Full-resolution visibility keeps upsampling from lighting unexplored edges.
 float visibility=1.;
 if(hasVisibility){vec2 uv=(surface.xz+.5)/mapSize;visibility=texture2D(visibilityMap,clamp(uv,0.,1.)).r;
 if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))visibility=0.;}
 vec3 color=texture2D(sceneColor,vUv).rgb;
 gl_FragColor=vec4(color*mix(1.,fog.a,visibility)+fog.rgb*visibility,1.);
 if(hasDaytimeFog && texture2D(sceneDepth,vUv).r<.999999)gl_FragColor.rgb=mix(gl_FragColor.rgb,daytimeFogColor,daytimeOpacity(surface)*visibility);
 // The recovered source shaders leave their optional tone mapper disabled.
 // Avoid the old hand-tuned ACES exposure when comparing original source assets.
 if(!sourceReference)gl_FragColor.rgb=ACESFilmicToneMapping(gl_FragColor.rgb);
 // Keep LUT input in display sRGB independently of the destination. Three's
 // colorspace_fragment is identity for render targets; grading after it made PNG
 // captures grade linear values while the live canvas graded sRGB values.
 // PostProcess.fx samples directly, without a half-texel coordinate remap.
 // The original target encoding remains an explicit assumption (see sky.md).
 if(hasDaytimeFog){
  vec4 displayColor=sRGBTransferOETF(gl_FragColor);
  vec3 graded=mix(texture(daytimeLutFrom,displayColor.rgb).rgb,texture(daytimeLutTo,displayColor.rgb).rgb,daytimeLutBlend);
  displayColor.rgb=mix(displayColor.rgb,graded,visibility);
  gl_FragColor=sRGBTransferEOTF(displayColor);
 }
 #include <colorspace_fragment>
}
`;
