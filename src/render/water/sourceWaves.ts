/** Static-flow portion of supplied Water.fxs::GetWaves and DiscretizeWaves.
 * Dynamic unit disturbances are a separate simulation texture, not synthesized here. */
export const sourceWavesGLSL=`
vec4 sourceWaveSample(vec2 world,vec2 direction,float speed,float lod){
 const float segment=6.28318530718/32.;
 float angle=atan(direction.y,direction.x),a0=floor((angle+3.14159265359)/segment)*segment-3.14159265359,a1=a0+segment;
 vec2 d0=vec2(cos(a0),sin(a0)),d1=vec2(cos(a1),sin(a1));
 float at=clamp((angle-a0)/segment,0.,1.),s0=floor(speed*10.)*.1,s1=s0+.1,st=clamp((speed-s0)*10.,0.,1.);
 vec2 uv0=vec2(dot(d0,world),dot(vec2(-d0.y,d0.x),world));
 vec2 uv1=vec2(dot(d1,world),dot(vec2(-d1.y,d1.x),world));
 vec2 scroll=vec2(-5.*uSourceWaterTime,50.);const float scale=.1/1.75;
 vec4 w0=mix(textureLod(uSourceWaterWaves,(uv0+scroll*s0)*scale,lod),textureLod(uSourceWaterWaves,(uv1+scroll*s0)*scale,lod),at);
 vec4 w1=mix(textureLod(uSourceWaterWaves,(uv0+scroll*s1)*scale,lod),textureLod(uSourceWaterWaves,(uv1+scroll*s1)*scale,lod),at);
 return mix(w0,w1,st);
}
vec3 sourceWaveNormal(vec2 xy){xy=2.*(xy-.50196);return vec3(xy,sqrt(max(0.,1.-dot(xy,xy))));}
float sourceWaves(vec3 world,bool vertex,out vec3 worldNormal,out float foam){
 vec4 map=texture2D(uSourceWaterFlow,(world.xz-uSourceWaterOrigin)/uSourceWaterSize);
 vec2 flow=2.*(map.rg-.50196)*(1.-map.b*.6);
 float speed=length(flow);vec2 dir=speed>.00001?flow/speed:vec2(1.,0.);
 vec3 toEye=cameraPosition-world;float lod=log2(max(length(toEye)/64./max(normalize(toEye).y,.01),.0001));
 if(vertex)lod*=2.;
 vec2 sourceXZ=world.xz-uSourceWaterOffset;
 vec4 wave=sourceWaveSample(sourceXZ,dir,speed,lod),still=textureLod(uSourceWaterWaves,sourceXZ*(.1/1.75),lod);
 vec3 local=sourceWaveNormal(wave.rg),idle=sourceWaveNormal(vec2(.50196));
 float strength=vertex?sqrt(clamp((speed-.02)/.96,0.,1.)):speed;
 vec3 oriented=vec3(dir.x*local.x-dir.y*local.y,local.z,dir.y*local.x+dir.x*local.y);
 worldNormal=normalize(mix(idle.xzy,oriented,strength));
 float waveFoam=mix(still.b,wave.b,clamp(speed/.2,0.,1.));
 foam=vertex?clamp(mix(still.b,waveFoam,strength)*1.6-.4,0.,1.)*.4:waveFoam;
 return vertex?(wave.a-.35)*4.*strength:wave.a*strength;
}
`;
