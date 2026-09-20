/** TerrainCommon.fxh::ComputeLightMapOcclusion. RGB stores the three height
 * bands packed in underlay GBA. The caller adds the sprite base-height offset
 * (packed in height-texture G) before calling, without using another sampler. */
export const sourceOcclusionGLSL=`
 uniform vec4 uReferenceOcclusionLayout;
 uniform vec2 uReferenceOcclusionSize;
 float referenceOcclusion(vec3 world,float terrainHeight,float useLevel0,bool forceLevel0){
  vec2 grid=(world.xz-uReferenceOcclusionLayout.xy)*uReferenceOcclusionLayout.zw;
  if(any(lessThan(grid,vec2(0.)))||any(greaterThan(grid,uReferenceOcclusionSize-1.)))return 1.;
  vec3 bands=texture2D(uReferenceUnderlay,(grid+.5)/uReferenceOcclusionSize).gba;
  float d=world.y-terrainHeight;
  float occlusion=mix(bands.r,bands.g,clamp(d/.5+(forceLevel0?0.:1.-useLevel0),0.,1.));
  if(!forceLevel0){
   occlusion=mix(occlusion,bands.b,clamp((d-.5)/1.5,0.,1.));
   occlusion=mix(occlusion,1.,clamp((d-2.)/7.,0.,1.));
  }
  return occlusion;
 }
`;
