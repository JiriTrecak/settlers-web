import {DEFAULT_WATER_WAVES} from '../../shared/authoring/recipes';

/** One world-space field in both shader stages. Depth changes its amplitude,
 * never its phase, so a ford and open water cannot slide apart at a boundary. */
export const stylizedWavesGLSL=`
float waterHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float waterNoise(vec2 p){
 vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);
 return mix(mix(waterHash(i),waterHash(i+vec2(1.,0.)),u.x),mix(waterHash(i+vec2(0.,1.)),waterHash(i+1.),u.x),u.y);
}
vec4 swellSettings(vec2 p){return uAuthoredWater?waterProfile(p,4.):vec4(${DEFAULT_WATER_WAVES.height},${DEFAULT_WATER_WAVES.length}.,${DEFAULT_WATER_WAVES.speed},${DEFAULT_WATER_WAVES.depthEnd});}
vec4 shoreSettings(vec2 p){return uAuthoredWater?waterProfile(p,5.):vec4(${DEFAULT_WATER_WAVES.depthStart},${DEFAULT_WATER_WAVES.shallowStrength},${DEFAULT_WATER_WAVES.shoreWidth},${DEFAULT_WATER_WAVES.crestStrength});}
float openWater(float depth,vec4 swell,vec4 shore){return smoothstep(shore.x,swell.w,depth);}
float swellAmplitude(float depth,vec4 swell,vec4 shore){
 // Never expose a shallow bed with a wave trough, or move the dry coastline.
 return min(max(depth,0.)*.18,swell.x*mix(shore.y,1.,openWater(depth,swell,shore)))*smoothstep(0.,.16,depth);
}
float swellField(vec2 world,vec4 swell){
 vec2 flow=texture2D(uSourceWaterFlow,(world-uSourceWaterOrigin)/uSourceWaterSize).rg*2.-1.;
 vec2 p=(world-uSourceWaterOffset-flow*uSourceWaterTime*.5)*(6.2831853/swell.y);
 float t=uSourceWaterTime*swell.z;
 // Independently bend the wave trains and vary their strength in broad moving
 // patches. This breaks parallel rows without adding high-frequency chop.
 vec2 drift=vec2(t*.035,-t*.025);
 vec2 warp=vec2(waterNoise(p*.38+drift),waterNoise(p*.31-drift+17.))-.5;
 vec2 q=p+warp*2.4;
 float packet=waterNoise(p*.21+vec2(-t*.045,t*.018)+31.);
 float a=sin(dot(q,vec2(.93,.37))-t);
 float b=sin(dot(q,vec2(-.48,.88))*1.31+t*.73+warp.x);
 float c=sin(dot(p,vec2(.3,.95))*1.87-t*1.09+warp.y*3.);
 // Convex weights keep the height bounded by the authored amplitude, including
 // through the shallow-water safety cap. No cell-local phase or random seed.
 float primary=mix(.38,.58,packet);
 return (primary*a+(.8-primary)*b+.2*c)*mix(.8,1.,packet);
}
float surfaceHeight(vec2 p,float level){
 vec4 swell=swellSettings(p),shore=shoreSettings(p);
 return swellField(p,swell)*swellAmplitude(level-sourceGround(p),swell,shore);
}
vec3 surfaceNormal(vec2 p,float level,float pixelSize,out float crest){
 vec4 swell=swellSettings(p),shore=shoreSettings(p);
 float depth=level-sourceGround(p),amplitude=swellAmplitude(depth,swell,shore);
 float e=max(.16,pixelSize*.75),h=swellField(p,swell);
 // Evaluate the amplitude at the neighbours too: normals follow the geometry
 // through the shallow/deep blend rather than lighting a phantom seam.
 vec2 slope=vec2(surfaceHeight(p+vec2(e,0.),level)-surfaceHeight(p-vec2(e,0.),level),surfaceHeight(p+vec2(0.,e),level)-surfaceHeight(p-vec2(0.,e),level))/(2.*e);
 vec4 effects=uAuthoredWater?waterProfile(p,2.):vec4(.15,.055,.1,.5);
 float ripple=effects.g*mix(.1,.65,openWater(depth,swell,shore))*(1.-smoothstep(.15,.75,pixelSize))*smoothstep(0.,.2,depth);
 vec2 q=p*effects.r*5.+vec2(uSourceWaterTime*.14,-uSourceWaterTime*.09);
 slope+=vec2(cos(q.x+sin(q.y)),cos(q.y*.87+sin(q.x)))*ripple;
 crest=smoothstep(.48,.88,h)*openWater(depth,swell,shore)*smoothstep(.005,.12,amplitude);
 return normalize(vec3(-slope.x,1.,-slope.y));
}
`;
