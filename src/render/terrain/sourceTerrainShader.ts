/** Terrain.fx layer blending shared by color and displaced shadow vertices.
 * Explicit LOD zero is intentional: both source DS and PS request it. */
export function sourceTerrainGLSL(layerCount:number){return `
 uniform highp sampler2DArray uSourceAR,uSourceNH,uSourceMasks,uSourceDisplacement;
 uniform sampler2D uSourceSlots,uTerrainUnderlay,uSourceDisplacementMask,uSourceHeight;
 uniform vec2 uSourceOrigin,uSourceOffset,uSourceSize,uSourceHeightSize;
 uniform float uSourceDisplacementTiling,uSourceHasDisplacement;
 uniform vec4 uSourceParams[${layerCount}];uniform float uSourceDesaturation[${layerCount}];
 float terrainHeight(vec2 world){
  vec2 p=clamp((world-uSourceOrigin)*3.,vec2(0.),uSourceHeightSize-1.),i=floor(p),f=fract(p),uv=(i+.5)/uSourceHeightSize,d=1./uSourceHeightSize;
  return mix(mix(textureLod(uSourceHeight,uv,0.).r,textureLod(uSourceHeight,uv+vec2(d.x,0.),0.).r,f.x),mix(textureLod(uSourceHeight,uv+vec2(0.,d.y),0.).r,textureLod(uSourceHeight,uv+d,0.).r,f.x),f.y);
 }
 vec3 terrainNormal(vec2 world){
  // TerrainCommon.fxh samples three half-texel corners; its du is 8/49.
  float a=terrainHeight(world-vec2(1./6.)),b=terrainHeight(world+vec2(1./6.,-1./6.)),c=terrainHeight(world+vec2(-1./6.,1./6.));
  return normalize(vec3((a-b)/(8./49.),2.,(a-c)/(8./49.)));
 }
 mat3 terrainBasis(vec3 n){vec3 b=normalize(cross(vec3(1.,0.,0.),n)),t=normalize(cross(n,b));return mat3(t,b,n);}
 float terrainUnderlay(vec2 world){
  vec2 uv=(world-uSourceOrigin)/uSourceSize,size=vec2(textureSize(uTerrainUnderlay,0));
  return textureLod(uTerrainUnderlay,(uv*(size-1.)+.5)/size,0.).r;
 }
 float terrainDisplacementMask(vec2 world){return textureLod(uSourceDisplacementMask,(world-uSourceOrigin)/uSourceSize,0.).r;}
 vec4 terrainDisplacement(vec2 world){return textureLod(uSourceDisplacement,vec3((world-uSourceOffset)*uSourceDisplacementTiling*.08,0.),0.);}
 void terrainLayers(vec2 world,float normalY,out vec4 ar,out vec4 nh){
  vec2 sourceXZ=world-uSourceOffset,uv=(world-uSourceOrigin)/uSourceSize;
  float underlay=terrainUnderlay(world);
  ivec2 sub=ivec2(clamp(floor((world-uSourceOrigin)/4.),vec2(0.),uSourceSize/4.-1.));
  vec4 ids0=texelFetch(uSourceSlots,ivec2(sub.x*2,sub.y),0)*255.,ids1=texelFetch(uSourceSlots,ivec2(sub.x*2+1,sub.y),0)*255.;
  int ids[6];ids[0]=int(ids0.x+.5);ids[1]=int(ids0.y+.5);ids[2]=int(ids0.z+.5);ids[3]=int(ids0.w+.5);ids[4]=int(ids1.x+.5);ids[5]=int(ids1.y+.5);
  int base=clamp(ids[0],0,${layerCount-1});vec2 tile=sourceXZ*uSourceParams[base].x*.08;
  ar=textureLod(uSourceAR,vec3(tile,float(base)),0.);nh=textureLod(uSourceNH,vec3(tile,float(base)),0.);
  ar.rgb*=1.-max(underlay-.75,0.);
  for(int j=1;j<6;j++){
   int id=ids[j];if(id<=0||id>=${layerCount})continue;
   vec4 param=uSourceParams[id];vec2 tileUV=sourceXZ*param.x*.08;
   vec4 layerAR=textureLod(uSourceAR,vec3(tileUV,float(id)),0.),layerNH=textureLod(uSourceNH,vec3(tileUV,float(id)),0.);
   float weight=textureLod(uSourceMasks,vec3(uv,float(id)),0.).r;
   weight*=1.-underlay*(1.-nh.a*.5);
   if(param.z>=0.)weight*=mix(1.,clamp(normalY,0.,1.),param.z);else weight=clamp(weight+(1.-normalY)*-param.z,0.,1.);
   layerAR.rgb*=mix(1.,clamp((weight-.25)/.75,0.,1.),param.w);
   if(uSourceDesaturation[id]>0.)ar.rgb=mix(ar.rgb,vec3(dot(layerAR.rgb,vec3(uSourceDesaturation[id]))),clamp((weight-.5)/.5,0.,1.));
   float k=param.y>=0.?clamp(((layerNH.a+.5)*weight-nh.a+.25)/max(param.y,.00001),0.,1.):clamp((1.-layerNH.a)+(weight-(1.-layerNH.a))*(1.-param.y),0.,1.);
   ar=mix(ar,layerAR,k);nh=mix(nh,vec4(layerNH.rgb,param.y>=0.?layerNH.a:.5),k);
  }
 }
 vec3 terrainDisplace(vec3 p){
  if(uSourceHasDisplacement<.5)return p;
  vec3 baseNormal=terrainNormal(p.xz);float mask=terrainDisplacementMask(p.xz);
  vec4 ar,nh;terrainLayers(p.xz,1.,ar,nh);
  vec4 d=terrainDisplacement(p.xz);
  vec3 n=normalize(terrainBasis(baseNormal)*(2.*(d.rgb-.50196)));
  p.y+=(nh.a-.5)*.5*(1.-mask)*(1.-terrainUnderlay(p.xz));
  p.xz-=n.xz*.5*mask;
  p+=baseNormal*(d.a-.25)*mask;
  return p;
 }
`;}
