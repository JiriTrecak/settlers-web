import {stylizedWavesGLSL} from './stylizedWaves';
import {WATER_PROFILE_ROWS} from './waterSurface';

const common=`
uniform float uSourceWaterTime;
uniform sampler2D uSourceWaterFlow,uSourceWaterGround;
uniform vec2 uSourceWaterOrigin,uSourceWaterSize,uSourceWaterOffset,uSourceWaterGroundSize;
uniform float uSourceWaterGroundScale;
uniform sampler2D uWaterProfiles;uniform bool uAuthoredWater;
vec4 waterProfile(vec2 world,float row){
 ivec2 cell=ivec2(clamp(floor(world-uSourceWaterOrigin),vec2(0.),uSourceWaterSize-1.));
 float index=floor(texelFetch(uSourceWaterFlow,cell,0).a*255.+.5);
 return texture2D(uWaterProfiles,vec2((index+.5)/256.,(row+.5)/${WATER_PROFILE_ROWS}.));
}
float sourceGround(vec2 p){
 vec2 size=uSourceWaterGroundSize,q=clamp((p-uSourceWaterOrigin)*uSourceWaterGroundScale,vec2(0.),size-1.),i=floor(q),f=fract(q),uv=(i+.5)/size,d=1./size;
 return mix(mix(texture2D(uSourceWaterGround,uv).r,texture2D(uSourceWaterGround,uv+vec2(d.x,0.)).r,f.x),mix(texture2D(uSourceWaterGround,uv+vec2(0.,d.y)).r,texture2D(uSourceWaterGround,uv+d).r,f.x),f.y);
}
${stylizedWavesGLSL}
uniform samplerCube uReflectionCube;
uniform vec3 uDirectLight,uAmbientLight,uSunDirection;
varying vec3 vSourceWater;
varying float vWaterLevel;
`;
export const sourceWaterVertex=`
${common}
void main(){
 vec3 p=position;p.y+=surfaceHeight(position.xz,position.y);
 vSourceWater=p;vWaterLevel=position.y;
 gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
 // UTC_VISIBILITY_VERTEX
}
`;

/** Depth absorption, refraction, swells and broken foam inspired by the approach
 * in https://gameidea.org/2026/02/01/creating-a-stylized-3d-water-shader/ .
 * Uses the game's saved local surface levels, lighting and visibility passes. */
export const sourceWaterFragment=`
#include <common>
#include <packing>
#include <shadowmap_pars_fragment>
${common}
uniform sampler2D uOpaqueColor,uOpaqueDepth,uSourceCaustics,uSourceReflections;
uniform vec2 uViewport,uShadowSize;
uniform mat4 uInverseProjection,uCameraWorld,uShadowMatrix,projectionMatrix;
uniform bool uHasShadow;
uniform float uShadowBias,uShadowRadius;
#ifdef SHADOWMAP_TYPE_PCF
uniform highp sampler2DShadow uSunShadow;
#else
uniform sampler2D uSunShadow;
#endif
vec3 worldAt(vec2 uv){
 vec4 p=uInverseProjection*vec4(uv*2.-1.,texture2D(uOpaqueDepth,uv).r*2.-1.,1.);
 return (uCameraWorld*vec4(p.xyz/p.w,1.)).xyz;
}
// Rounded foam islands, not a thin continuous white shoreline or tiny glitter.
float foamCells(vec2 p){
 vec2 cell=floor(p),f=fract(p);float nearest=2.;
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
  vec2 q=vec2(float(x),float(y)),seed=cell+q;
  vec2 point=vec2(waterHash(seed),waterHash(seed+31.7));
  point=.5+.3*sin(point*6.2831853+uSourceWaterTime*.25);
  nearest=min(nearest,length(q+point-f));
 }
 return nearest;
}
void main(){
 vec2 p=vSourceWater.xz,screenUV=gl_FragCoord.xy/uViewport;
 float bed=sourceGround(p),depth=max(vWaterLevel-bed,0.);
 if(vSourceWater.y-bed<.005)discard;
 vec4 shallow=waterProfile(p,0.),deep=waterProfile(p,1.),effects=waterProfile(p,2.),shore=shoreSettings(p),swell=swellSettings(p);
 if(!uAuthoredWater){shallow=vec4(.05,.22,.20,1.6);deep=vec4(.006,.045,.07,.45);effects=vec4(.15,.055,.1,.5);}
 float t=uSourceWaterTime,openness=openWater(depth,swell,shore);
 float pixel=max(length(dFdx(p)),length(dFdy(p))),crest;
 vec3 normal=surfaceNormal(p,vWaterLevel,pixel,crest),original=worldAt(screenUV);
 vec3 toEye=normalize(cameraPosition-vSourceWater);
 float originalColumn=max(vSourceWater.y-original.y,0.);
 // Convert a small world-space bend to screen space. It behaves consistently
 // at gameplay zoom and overview zoom, and cannot pull dry foreground into water.
 vec3 bend=(viewMatrix*vec4(normal.x,0.,normal.z,0.)).xyz;
 vec4 viewPos=viewMatrix*vec4(vSourceWater,1.);
 float perspectiveScale=projectionMatrix[3][3]==0.?1./max(-viewPos.z,.1):1.;
 vec2 offset=bend.xy*vec2(projectionMatrix[0][0],projectionMatrix[1][1])*perspectiveScale*.7*smoothstep(0.,.65,originalColumn);
 vec2 refrUV=clamp(screenUV+offset,vec2(.001),vec2(.999));
 vec3 refrWorld=worldAt(refrUV);
 float sceneZ=(viewMatrix*vec4(refrWorld,1.)).z;
 if(sceneZ>viewPos.z-.02||refrWorld.y>vSourceWater.y){refrUV=screenUV;refrWorld=original;}
 float column=max(vSourceWater.y-refrWorld.y,0.),clarity=max(.2,shallow.a);
 float shadow=1.;
 if(uHasShadow)shadow=getShadow(uSunShadow,uShadowSize,1.,uShadowBias,uShadowRadius,uShadowMatrix*vec4(vSourceWater,1.));
 vec3 light=uDirectLight*max(uSunDirection.y,0.)*mix(.38,1.,shadow)+uAmbientLight*.6;
 vec3 fullSun=uDirectLight*max(uSunDirection.y,0.)+uAmbientLight*.6;
 vec3 bodyLight=light/max(dot(fullSun,vec3(.2126,.7152,.0722)),.001);
 vec3 screenColor=texture2D(uOpaqueColor,refrUV).rgb;
 // Subtle moving light on the actual bed, attenuated at the shore and at depth.
 vec2 causticUV=refrWorld.xz*.075;
 float ca=texture2D(uSourceCaustics,causticUV+vec2(t*.006,0.)).r;
 float cb=texture2D(uSourceCaustics,causticUV*.83-vec2(0.,t*.005)).g;
 float causticFade=smoothstep(.08,.5,column)*exp(-column*.7);
 screenColor+=ca*cb*effects.b*.12*light*causticFade*shadow;
 vec3 transmittance=exp(-column/clarity*vec3(1.7,.9,.65));
 vec3 tint=shallow.rgb/max(max(shallow.r,shallow.g),max(shallow.b,.001));
 screenColor*=mix(vec3(1.),tint,smoothstep(0.,.35,column)*.32);
 vec3 waterColor=mix(shallow.rgb,deep.rgb,1.-exp(-column/(clarity*1.5)))*bodyLight;
 vec3 color=screenColor*transmittance+waterColor*(1.-transmittance);
 // Rounded bands of light on the swells remain visible at an RTS distance.
 float ndl=max(dot(normal,uSunDirection),0.);
 color*=mix(1.,.68+ndl*.55,smoothstep(.4,2.,column));
 vec3 reflected=textureCube(uReflectionCube,reflect(-toEye,normal)).rgb;
 // Bound the sky contribution so the bright analytic forest sky does not
 // wash the entire lake into a milky white sheet.
 reflected=reflected/(1.+reflected)*bodyLight*.45;
 vec4 screenReflection=texture2D(uSourceReflections,clamp(screenUV+offset*.35,vec2(.001),vec2(.999)));
 reflected=mix(reflected,screenReflection.rgb,screenReflection.a);
 float fresnel=.035+.965*pow(1.-clamp(dot(normal,toEye),0.,1.),5.);
 float reflection=clamp((fresnel+.045*openness)*deep.a,0.,.7);
 color=mix(color,reflected,reflection);
 vec3 halfLight=normalize(toEye+uSunDirection);
 float highlight=pow(max(dot(normal,halfLight),0.),120.);
 color+=vec3(.65,.86,.94)*bodyLight*highlight*deep.a*.10*shadow;
 // Use bank distance for shore foam: shallow flat crossings do not become foam.
 vec2 bedSlope=vec2(sourceGround(p+vec2(.5,0.))-sourceGround(p-vec2(.5,0.)),sourceGround(p+vec2(0.,.5))-sourceGround(p-vec2(0.,.5)));
 float slope=length(bedSlope),distanceToShore=depth/max(slope,.001);
 float noise=waterNoise(p*.65+vec2(t*.07,-t*.05));
 float width=shore.z*(.65+.35*sin(t*.8+noise*4.)),aa=max(fwidth(distanceToShore),.04);
 float shoreMask=(1.-smoothstep(width-aa,width+aa,distanceToShore))*smoothstep(.025,.14,slope);
 vec2 foamUV=p*.9+vec2(t*.035,-t*.024)+vec2(noise,waterNoise(p*.4+7.))*.5;
 float cells=foamCells(foamUV),cellAA=max(fwidth(cells),.025);
 float islands=1.-smoothstep(.24-cellAA,.24+cellAA,cells);
 float shoreFoam=shoreMask*mix(.18,islands, .82)*effects.a;
 vec4 flow=texture2D(uSourceWaterFlow,(p-uSourceWaterOrigin)/uSourceWaterSize);
 vec2 crestUV=vec2(dot(p,vec2(.93,.37))*2.2,dot(p,vec2(-.37,.93))*.55)+vec2(noise,t*.06);
 float streaks=smoothstep(.36,.65,waterNoise(crestUV));
 float crestFoam=crest*shore.w*smoothstep(.3,.64,noise)*streaks;
 float foam=clamp(shoreFoam+crestFoam+flow.b*islands*effects.a*.35,0.,.85);
 vec3 foamColor=vec3(.76,.86,.84)*dot(bodyLight,vec3(.2126,.7152,.0722));
 color=mix(color,foamColor,foam);
 if(uAuthoredWater)color*=1.-waterProfile(p,3.).r*(.5+.5*sin(p.x*.07+p.y*.04+t*.04));
 gl_FragColor=vec4(color,1.);
 // UTC_VISIBILITY_FRAGMENT
}
`;
