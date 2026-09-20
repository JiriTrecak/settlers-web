import {Mesh,MeshStandardMaterial,DoubleSide,SRGBColorSpace,ShaderChunk,type Object3D,type Texture} from 'three';
import type {ReferenceGround} from './referenceGround';

/** Cache vertex colors encode pivots, not tint. Import retains them in _leaf;
 * COLOR_0 stores vertex occlusion. Matches Plants.fxs::PatchPlantNormals. */
export function prepareReferencePlants(root:Object3D,ground?:ReferenceGround,macro?:()=>Texture):boolean {
 let found=false;
 root.traverse(node=>{
  if(!(node instanceof Mesh))return;
  for(const m of Array.isArray(node.material)?node.material:[node.material]){
   if(!(m instanceof MeshStandardMaterial)||!m.userData.referenceEnvironment)continue;
   found=true;
   if(m.map){m.map.anisotropy=8;m.map.colorSpace=SRGBColorSpace;m.map.needsUpdate=true;}
   node.castShadow=!m.userData.underlay;node.receiveShadow=true;
   if(m.userData.underlay){m.depthWrite=false;m.polygonOffset=true;m.polygonOffsetFactor=-1;m.polygonOffsetUnits=-1;node.renderOrder=1;}
   if(m.userData.referencePrepared)continue;
   m.userData.referencePrepared=true;
   m.color.setScalar(1);
   const macroTexture=macro?.();
   if(macroTexture&&ground)ground.attachColor(m,macroTexture,m.userData.sourceShaderAttributes?.IsUseGroundColor==='true',!m.userData.underlay);
   if(m.userData.underlay&&ground)ground.attach(m);
   // Normal.w is ambient occlusion, not a tint. Multiplying the albedo also
   // darkens direct sunlight and makes the undersides of branches almost black.
   if(node.geometry.hasAttribute('color')){
    const previous=m.onBeforeCompile,key=m.customProgramCacheKey.bind(m);
    m.onBeforeCompile=(s,r)=>{
     previous.call(m,s,r);
     s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>','')
      .replace('#include <aomap_fragment>',`#include <aomap_fragment>
       #ifdef USE_COLOR
        reflectedLight.indirectDiffuse*=${ground&&macroTexture?'mix(vColor.r,1.,uReferenceColorEnabled)':'vColor.r'};
        reflectedLight.indirectSpecular*=${ground&&macroTexture?'mix(max(.1,vColor.r*vColor.r),1.,uReferenceColorEnabled)':'max(.1,vColor.r*vColor.r)'};
       #endif
      `);
    };
    m.customProgramCacheKey=()=>key()+'/source-vertex-occlusion';
   }
   const priorLight=m.onBeforeCompile,lightKey=m.customProgramCacheKey.bind(m);
   m.onBeforeCompile=(s,r)=>{
    priorLight.call(m,s,r);
    s.uniforms.uSourceBackside={value:Number(m.userData.backsideLighting)||0};
    s.uniforms.uSourceShading={value:m.metalnessMap};
    const backside=`clamp(uSourceBackside${m.userData.sourceShadingLoaded?'+1.-texture2D(uSourceShading,vMetalnessMapUv).b':''},0.,1.)`;
    s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nuniform float uSourceBackside;uniform sampler2D uSourceShading;')
     .replace('float occlusionBackside=0.; // SOURCE_OCCLUSION_BACKSIDE',`float occlusionBackside=${backside};`)
     .replace('float backside=0.; // SOURCE_BACKSIDE',`float backside=${backside};`)
     .replace('float sourceSpecularMultiplier=1.; // SOURCE_SPECULAR_MULTIPLIER',m.userData.sourceShader==='plant'?`float sourceSpecularMultiplier=max(1.-(${backside})/.5,0.);`:'float sourceSpecularMultiplier=1.;')
     .replace('#include <metalnessmap_fragment>',ShaderChunk.metalnessmap_fragment.replace('texelMetalness.b','texelMetalness.r'))
     .replace('#include <lights_physical_pars_fragment>',ShaderChunk.lights_physical_pars_fragment)
     .replaceAll('saturate( dot( geometryNormal, directLight.direction ) )',`mix(saturate(dot(geometryNormal,directLight.direction)),1.,${backside})`);
   };
   m.customProgramCacheKey=()=>lightKey()+'/source-mrb-specular-v3-'+!!m.userData.sourceShadingLoaded+'-'+m.userData.sourceShader;
   if(!m.userData.foliage)continue;
   m.side=DoubleSide;
   const height=Number(node.userData.plantHeight)||12;
   const previousKey=m.customProgramCacheKey.bind(m);
   m.customProgramCacheKey=()=>previousKey()+`/reference-plant-3-${height}`;
   const previous=m.onBeforeCompile;
   m.onBeforeCompile=(s,r)=>{
    previous.call(m,s,r);
    s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nattribute vec4 _leaf;')
     .replace('#include <defaultnormal_vertex>',`#include <defaultnormal_vertex>
      // Plants.fxs patches after its quaternion-to-world transform. Removing
      // scale here matches that rotation-only direction transform.
      mat3 crownRotation=mat3(modelMatrix);
      #ifdef USE_INSTANCING
       crownRotation=mat3(modelMatrix)*mat3(instanceMatrix);
      #endif
      crownRotation[0]=normalize(crownRotation[0]);
      crownRotation[1]=normalize(crownRotation[1]);
      crownRotation[2]=normalize(crownRotation[2]);
      vec3 radial=vec3(position.x,0.,position.z);
      radial=length(radial)>0.?normalize(radial):vec3(1.,0.,0.);
      vec3 crownDirection=crownRotation*radial;
      vec3 crownUpward=crownDirection+vec3(0.,1.,0.);
      crownUpward=length(crownUpward)>0.?normalize(crownUpward):vec3(0.,1.,0.);
      vec3 crownNormal=normalize(mix(vec3(0.,1.,0.),crownUpward,clamp((${height.toFixed(5)}-.8)/2.6,0.,1.)));
      float crownMask=_leaf.a>0.?1.:0.;
      transformedNormal=mix(transformedNormal,mat3(viewMatrix)*crownNormal,crownMask);
      #ifdef USE_TANGENT
       vec3 crownTangent=normalize(cross(crownNormal,vec3(0.,0.,1.)));
       transformedTangent=mix(transformedTangent,mat3(viewMatrix)*crownTangent,crownMask);
      #endif`);
    s.fragmentShader=s.fragmentShader.replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\nnormal*=gl_FrontFacing?1.0:-1.0;');
   };
   m.needsUpdate=true;
  }
 });
 return found;
}
