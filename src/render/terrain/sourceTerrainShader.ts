/** Shared layer blending. Geometry samples exact heights; fragment color and
 * normals use screen derivatives so distant terrain stays crisp without shimmer. */
export function sourceTerrainGLSL(layerCount:number,fragment=false){
 const sample=(tex:string,uv:string,layer:string)=>fragment?`textureGrad(${tex},vec3(${uv},${layer}),dFdx(${uv}),dFdy(${uv}))`:`textureLod(${tex},vec3(${uv},${layer}),0.)`;
 return `
 uniform highp sampler2DArray uSourceAR,uSourceNH,uSourceOM,uSourceMasks,uSourceDisplacement;
 uniform sampler2D uSourceSlots,uTerrainUnderlay,uSourceDisplacementMask,uSourceHeight;
 uniform vec2 uSourceOrigin,uSourceOffset,uSourceSize,uSourceHeightSize;
 uniform float uSourceHeightScale;
 uniform float uSourceAllLayers;
 uniform int uSourceMetadataOffset;
 vec4 terrainLayerData(int layer,int column){
  int index=uSourceMetadataOffset+layer*8+column,width=textureSize(uSourceSlots,0).x;
  return texelFetch(uSourceSlots,ivec2(index%width,index/width),0);
 }
 int terrainCorner(int layer,int corner){return int(terrainLayerData(layer,4+corner/4)[corner%4]+.5);}
 vec2 terrainSurfaceOM=vec2(1.,0.);
 uniform float uSourceDisplacementTiling,uSourceHasDisplacement;

 float terrainHash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
 float terrainValueNoise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(terrainHash(i),terrainHash(i+vec2(1.,0.)),f.x),mix(terrainHash(i+vec2(0.,1.)),terrainHash(i+1.),f.x),f.y);
 }
 float terrainNoise(vec2 p){return terrainValueNoise(p)*.65+terrainValueNoise(p*2.03+vec2(5.2,1.3))*.35;}
 // Frayed grounds wobble their mask with ~9 m noise so blob outlines stay
 // organic; terrainDensity then turns the result into a soft edge.
 float terrainBreakup(float weight,vec2 world,float amount){
  return clamp(weight+amount*(terrainNoise(world*.11)-.5)*.9*smoothstep(0.,.6,weight),0.,1.);
 }
 // Soft blob edge centred on half coverage. The layer's tuft height shifts the
 // threshold ±.28, so partial coverage resolves into clumps with dirt between
 // them; with blend .35, full (1) and empty (0) coverage stay solid for any height.
 float terrainDensity(float weight,float height,float blend){
  return smoothstep(0.,1.,clamp((weight+(height-.5)*.55-.5)/max(blend,.00001)+.5,0.,1.));
 }
 float terrainHeight(vec2 world){
  vec2 p=clamp((world-uSourceOrigin)*uSourceHeightScale,vec2(0.),uSourceHeightSize-1.),i=floor(p),f=fract(p),uv=(i+.5)/uSourceHeightSize,d=1./uSourceHeightSize;
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
  terrainSurfaceOM=vec2(1.,0.);
  vec2 sourceXZ=world-uSourceOffset,uv=(world-uSourceOrigin)/uSourceSize;
  float underlay=terrainUnderlay(world);
  ivec2 sub=ivec2(clamp(floor((world-uSourceOrigin)/4.),vec2(0.),uSourceSize/4.-1.));
  vec4 ids0=texelFetch(uSourceSlots,ivec2(sub.x*2,sub.y),0),ids1=texelFetch(uSourceSlots,ivec2(sub.x*2+1,sub.y),0);
  int ids[6];ids[0]=int(ids0.x+.5);ids[1]=int(ids0.y+.5);ids[2]=int(ids0.z+.5);ids[3]=int(ids0.w+.5);ids[4]=int(ids1.x+.5);ids[5]=int(ids1.y+.5);
  int base=clamp(ids[0],0,${layerCount-1});vec2 tile=sourceXZ*terrainLayerData(base,0).x*.08;
  vec4 baseChannels=terrainLayerData(base,3);
  ar=${sample('uSourceAR','tile','baseChannels.y')};nh=${sample('uSourceNH','tile','baseChannels.z')};
  ar.rgb*=terrainLayerData(base,1).rgb*(1.-max(underlay-.75,0.));
  for(int j=1;j<${Math.max(6,layerCount)};j++){
   if(uSourceAllLayers<.5&&j>=6)break;
   int id=uSourceAllLayers>.5?j:ids[min(j,5)];if(id<=0||id>=${layerCount})continue;
   vec4 channels=terrainLayerData(id,3);if(channels.y<0.)continue;
   float weight=textureLod(uSourceMasks,vec3(uv,float(id)),0.).r;
   vec4 param=terrainLayerData(id,0),tint=terrainLayerData(id,1),groundLayout=terrainLayerData(id,2);
   float breakup=channels.x;
   if(groundLayout.x<0.){
    if(weight<=0.)continue;
    vec3 n=terrainNormal(world);vec2 limits=terrainLayerData(id,4).xy;
    float slope=length(n.xz)/max(n.y,.0001),alpha=weight*smoothstep(limits.x,limits.y,slope);
    if(alpha<=0.)continue;
    vec2 signs=mix(vec2(-1.),vec2(1.),step(vec2(0.),n.xz));
    float y=terrainHeight(world),blendX=abs(n.x)/max(abs(n.x)+abs(n.z),.0001);
    vec2 uvX=vec2(-world.y*signs.x/groundLayout.z,y/groundLayout.y),uvZ=vec2(world.x*signs.y/groundLayout.z,y/groundLayout.y);
    vec4 ax=${sample('uSourceAR','uvX','channels.y')},az=${sample('uSourceAR','uvZ','channels.y')};
    vec3 nx=${sample('uSourceNH','uvX','channels.z')}.rgb*2.-1.,nz=${sample('uSourceNH','uvZ','channels.z')}.rgb*2.-1.;
    vec3 worldNormal=normalize(mix(vec3(nz.x*signs.y,nz.y,nz.z*signs.y),vec3(nx.z*signs.x,nx.y,-nx.x*signs.x),blendX));
    vec3 localNormal=transpose(terrainBasis(n))*worldNormal;
    vec4 wall=mix(az,ax,blendX);wall.rgb*=tint.rgb;
    ar=mix(ar,wall,alpha);nh=mix(nh,vec4(localNormal*.5+.5,.5),alpha);
    vec2 ox=${sample('uSourceOM','uvX','channels.w')}.rg,oz=${sample('uSourceOM','uvZ','channels.w')}.rg;
    terrainSurfaceOM=mix(terrainSurfaceOM,mix(oz,ox,blendX),alpha);
    continue;
   }
   if(groundLayout.x>0.){
    vec2 grid=(world+vec2(.5))/groundLayout.z,cell=floor(grid),local=fract(grid);
    vec2 center=(cell+.5)*groundLayout.z-vec2(.5);
    vec2 maskSize=vec2(textureSize(uSourceMasks,0).xy),codeUV=(center-uSourceOrigin+.5)/maskSize;
    vec4 cellData=textureLod(uSourceMasks,vec3(codeUV,float(id)),0.);
    int code=int(cellData.g*255.+.5),corners=code&15;
    bool full=(code&16)!=0||corners==15;
    if(corners==0&&weight<=0.)continue;
    int atlasCell=full||corners==0?int(cellData.b*255.+.5):terrainCorner(id,corners);
    vec2 imageCell=vec2(float(atlasCell%int(groundLayout.x)),floor(float(atlasCell)/groundLayout.x));
    vec2 atlasSize=vec2(textureSize(uSourceAR,0).xy);
    ${fragment?'vec2 dx=dFdx(grid)/groundLayout.xy,dy=dFdy(grid)/groundLayout.xy;float footprint=max(length(dx*atlasSize),length(dy*atlasSize));':'float footprint=1.;'}
    vec2 inset=min(vec2(max(.5,ceil(footprint)))/atlasSize,.4/groundLayout.xy);
    vec2 lo=imageCell/groundLayout.xy+inset,hi=(imageCell+1.)/groundLayout.xy-inset;
    vec2 atlasUV=clamp((imageCell+local)/groundLayout.xy,lo,hi);
    vec4 groundAR=${fragment?'textureGrad(uSourceAR,vec3(atlasUV,channels.y),dx,dy)':'textureLod(uSourceAR,vec3(atlasUV,channels.y),0.)'};
    groundAR.rgb*=tint.rgb;
    vec4 groundNH=${fragment?'textureGrad(uSourceNH,vec3(atlasUV,channels.z),dx,dy)':'textureLod(uSourceNH,vec3(atlasUV,channels.z),0.)'};
    vec2 groundOM=${fragment?'textureGrad(uSourceOM,vec3(atlasUV,channels.w),dx,dy)':'textureLod(uSourceOM,vec3(atlasUV,channels.w),0.)'}.rg;
    float alpha=full?1.:corners==0?weight:groundNH.a;
    ar=mix(ar,groundAR,alpha);nh=mix(nh,vec4(groundNH.rgb,.5),alpha);terrainSurfaceOM=mix(terrainSurfaceOM,groundOM,alpha);
    continue;
   }
   if(weight<=0.)continue;
   vec2 tileUV=sourceXZ*param.x*.08;
   vec4 layerAR=${sample('uSourceAR','tileUV','channels.y')},layerNH=${sample('uSourceNH','tileUV','channels.z')};
   layerAR.rgb*=tint.rgb;
   if(breakup>0.)weight=terrainBreakup(weight,world,breakup);
   weight*=1.-underlay*(1.-nh.a*.5);
   if(param.z>=0.)weight*=mix(1.,clamp(normalY,0.,1.),param.z);else weight=clamp(weight+(1.-normalY)*-param.z,0.,1.);
   layerAR.rgb*=mix(1.,clamp((weight-.25)/.75,0.,1.),param.w);
   if(tint.a>0.)ar.rgb=mix(ar.rgb,vec3(dot(layerAR.rgb,vec3(tint.a))),clamp((weight-.5)/.5,0.,1.));
   float k=param.y>=0.?clamp(((layerNH.a+.5)*weight-nh.a+.25)/max(param.y,.00001),0.,1.):clamp((1.-layerNH.a)+(weight-(1.-layerNH.a))*(1.-param.y),0.,1.);
   if(breakup>0.)k=terrainDensity(weight,layerNH.a,param.y);
   ar=mix(ar,layerAR,k);nh=mix(nh,vec4(layerNH.rgb,param.y>=0.?layerNH.a:.5),k);
   terrainSurfaceOM=mix(terrainSurfaceOM,vec2(1.,0.),k);
  }
 }
 vec3 terrainDisplace(vec3 p){
  if(uSourceHasDisplacement<.5)return p;
  vec3 baseNormal=terrainNormal(p.xz);float mask=terrainDisplacementMask(p.xz);
  if(mask<=0.)return p;
  vec4 ar,nh;terrainLayers(p.xz,1.,ar,nh);
  vec4 d=terrainDisplacement(p.xz);
  vec3 n=normalize(terrainBasis(baseNormal)*(2.*(d.rgb-.50196)));
  p.xz-=n.xz*.5*mask;
  p+=baseNormal*(d.a-.25)*mask;
  return p;
 }
`;}
