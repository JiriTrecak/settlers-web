import {acquireSourceGround,releaseSourceGround,type SourceGroundTextures} from './sourceGroundTextures';
import {type SourceHeight} from '../../shared/map/importedTerrain';
import {DataTexture,FloatType,RedFormat,NearestFilter,Vector2,Vector4,type Texture,type Material,type WebGLProgramParametersWithUniforms} from 'three';
import type {HeightField} from '../../shared/map/height';
import {sourceOcclusionGLSL} from './sourceOcclusion';
import {sourceDirectLight} from './sourceDirectLight';
import {sourceReflection} from '../terrain/sourceReflection';

/** One height upload per terrain edit, shared by every instanced tree underlay.
 * Manual bilinear filtering also works without float-linear texture support. */
export class ReferenceGround {
 private readonly reflection=sourceReflection();
 get ready(){return this.colorEnabled.value?this.reflection.ready:Promise.resolve();}
 private loading=false;
 private source?:SourceHeight;
 readonly occlusionLayout={value:new Vector4(0,0,1,1)};
 readonly occlusionSize={value:new Vector2(1,1)};
 readonly color={value:new DataTexture(new Uint8Array([128,128,128,255]),1,1)};
 readonly underlay={value:new DataTexture(new Uint8Array([0,255,255,255]),1,1)};
 readonly colorLayout={value:new Vector4(0,0,1,1)};
 readonly sourceOffset={value:new Vector2()};
 readonly macroScale={value:.02};
 readonly colorEnabled={value:0};
 readonly texture={value:new DataTexture(new Float32Array(1),1,1,RedFormat,FloatType)};
 readonly grid={value:new Vector2(0,1)};
 readonly layout={value:new Vector4(0,0,1,1)};
 readonly dimensions={value:new Vector2(1,1)};
 private shared?:SourceGroundTextures;
 private releaseTextures(){
  if(this.shared){releaseSourceGround(this.shared);this.shared=undefined;}
  else{this.texture.value.dispose();this.color.value.dispose();this.underlay.value.dispose();}
 }
 updateSource(field:SourceHeight){
  if(this.source===field)return;
  this.releaseTextures();this.source=field;
  const shared=this.shared=acquireSourceGround(field);
  this.texture.value=shared.texture.value;this.color.value=shared.color.value;this.underlay.value=shared.underlay.value;
  this.colorEnabled.value=shared.colorEnabled.value;this.macroScale.value=shared.macroScale.value;
  this.sourceOffset.value.copy(shared.sourceOffset.value);this.colorLayout.value.copy(shared.colorLayout.value);
  this.occlusionSize.value.copy(shared.occlusionSize.value);this.occlusionLayout.value.copy(shared.occlusionLayout.value);
  this.layout.value.copy(shared.layout.value);this.dimensions.value.copy(shared.dimensions.value);
 }
 constructor(){this.texture.value.needsUpdate=true;this.color.value.needsUpdate=true;this.underlay.value.needsUpdate=true;}
 update(field:HeightField|null){
  if(field?.source){this.updateSource(field.source);return;}
  if(this.shared){
   this.releaseTextures();
   this.texture.value=new DataTexture(new Float32Array(1),1,1,RedFormat,FloatType);
   this.color.value=new DataTexture(new Uint8Array([128,128,128,255]),1,1);
   this.underlay.value=new DataTexture(new Uint8Array([0,255,255,255]),1,1);
   this.color.value.needsUpdate=true;this.underlay.value.needsUpdate=true;
  }
  this.source=undefined;this.colorEnabled.value=0;this.sourceOffset.value.set(0,0);this.macroScale.value=.02;
  const size=field?.verts??1;
  this.layout.value.set(field?.origin??0,field?.origin??0,1,1);this.dimensions.value.set(size,size);
  if(this.texture.value.format!==RedFormat||this.texture.value.image.width!==size||this.texture.value.image.height!==size){
   this.texture.value.dispose();
   this.texture.value=new DataTexture(new Float32Array(size*size),size,size,RedFormat,FloatType);
   this.texture.value.minFilter=this.texture.value.magFilter=NearestFilter;
  }
  const data=this.texture.value.image.data as Float32Array;
  if(field)data.set(field.samples);else data.fill(0);
  this.grid.value.set(field?.origin??0,size);this.texture.value.needsUpdate=true;
 }
 /** Source shaders apply optional ground tint and macro color independently. */
 attachColor(material:Material,macro:Texture,useGround:boolean,groundBounce=true,vertexLighting=false){
  const previous=material.onBeforeCompile,key=material.customProgramCacheKey.bind(material);
  material.onBeforeCompile=(s,r)=>{
   previous.call(material,s,r);
   this.compileSurface(s,macro,useGround,true,groundBounce,vertexLighting);
  };
  material.customProgramCacheKey=()=>key()+'/source-surface-color-'+useGround+'-'+groundBounce+'-'+vertexLighting;material.needsUpdate=true;
 }
 compileSurface(s:WebGLProgramParametersWithUniforms,macro:Texture,useGround:boolean,applyMacro=true,groundBounce=true,vertexLighting=false){
   if(!vertexLighting)sourceDirectLight(s);
   s.uniforms.uReferenceUnderlay=this.underlay;
   Object.assign(s.uniforms,{uReferenceOcclusionLayout:this.occlusionLayout,uReferenceOcclusionSize:this.occlusionSize});
   if(this.colorEnabled.value&&!this.loading){this.loading=true;void this.ready.catch(error=>console.error('Reference ambient cube',error));}
   Object.assign(s.uniforms,{uReferenceReflection:{value:this.reflection.texture},uReferenceBrdf:{value:this.reflection.brdf},uReferenceLightHeight:this.texture,uReferenceLightLayout:this.layout,uReferenceLightDimensions:this.dimensions,uReferenceColor:this.color,uReferenceColorLayout:this.colorLayout,uReferenceColorEnabled:this.colorEnabled,uReferenceSourceOffset:this.sourceOffset,uReferenceMacroScale:this.macroScale,uReferenceMacro:{value:macro}});
   s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vReferenceSurfaceXZ;varying float vReferenceSurfaceY;').replace('#include <project_vertex>',`#include <project_vertex>
    vec3 surfaceWorld=transpose(mat3(viewMatrix))*mvPosition.xyz+cameraPosition;
    vReferenceSurfaceXZ=surfaceWorld.xz;
    vReferenceSurfaceY=surfaceWorld.y;
   `);
   s.fragmentShader=s.fragmentShader.replace('#include <common>',`#include <common>
    varying vec2 vReferenceSurfaceXZ;varying float vReferenceSurfaceY;
    uniform samplerCube uReferenceReflection;uniform sampler2D uReferenceLightHeight,uReferenceBrdf;
    uniform vec4 uReferenceLightLayout;uniform vec2 uReferenceLightDimensions;
    uniform sampler2D uReferenceColor,uReferenceMacro,uReferenceUnderlay;uniform vec4 uReferenceColorLayout;
    uniform vec2 uReferenceSourceOffset;uniform float uReferenceMacroScale,uReferenceColorEnabled;
    ${sourceOcclusionGLSL}
   `).replace('#include <map_fragment>',`#include <map_fragment>
    ${useGround?'diffuseColor.rgb*=mix(vec3(1.),texture2D(uReferenceColor,(vReferenceSurfaceXZ-uReferenceColorLayout.xy)*uReferenceColorLayout.zw).rgb*2.,uReferenceColorEnabled);':''}
    ${applyMacro?'diffuseColor.rgb*=texture2D(uReferenceMacro,(vReferenceSurfaceXZ-uReferenceSourceOffset)*uReferenceMacroScale).rgb*2.;':''}
   `);
   if(!vertexLighting)s.fragmentShader=s.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
    if(uReferenceColorEnabled>0.){
     vec3 worldN=inverseTransformDirection(normal,viewMatrix);
     vec3 sourceIrradiance=sqrt(textureLod(uReferenceReflection,worldN,6.).rgb);
     float sourceAO=1.;
     #ifdef USE_COLOR
      sourceAO=vColor.r;
     #endif

     vec2 heightUV=((vReferenceSurfaceXZ-uReferenceLightLayout.xy)*uReferenceLightLayout.zw+.5)/uReferenceLightDimensions;
     float baseHeight=texture2D(uReferenceLightHeight,heightUV).r;
     float occlusionBackside=0.; // SOURCE_OCCLUSION_BACKSIDE
     sourceAO*=referenceOcclusion(vec3(vReferenceSurfaceXZ.x,vReferenceSurfaceY,vReferenceSurfaceXZ.y),baseHeight+texture2D(uReferenceLightHeight,heightUV).g*8.,occlusionBackside,${groundBounce?'false':'true'});
     sourceIrradiance=mix(sqrt(textureLod(uReferenceReflection,vec3(0.,-1.,0.),6.).rgb),sourceIrradiance,sourceAO)*sourceAO;
     float fade=1.-clamp((vReferenceSurfaceY-baseHeight)/8.,0.,1.);
     vec3 groundTint=texture2D(uReferenceColor,(vReferenceSurfaceXZ-uReferenceColorLayout.xy)*uReferenceColorLayout.zw).rgb*4.8;
     float downward=max(1.-worldN.y,0.);downward=.25+clamp(downward*downward,0.,1.)*.5;
     ${groundBounce?'sourceIrradiance*=mix(vec3(1.),mix(vec3(1.),groundTint,fade),downward);':''}
     float ndv=abs(dot(normal,geometryViewDir))+1e-5;
     float sourceFresnel=exp2((-5.55473*ndv-6.98316)*ndv);
     vec3 sourceF0=mix(vec3(.04),material.diffuseColor,material.metalness);
     vec3 fresnel=sourceF0+(max(vec3(pow(1.-material.roughness,2.)),sourceF0)-sourceF0)*sourceFresnel;
     reflectedLight.indirectDiffuse=ambientLightColor*(1.-fresnel)*material.diffuseColor*pow(1.-material.metalness,2.)*sourceIrradiance;
     vec3 sourceEye=inverseTransformDirection(geometryViewDir,viewMatrix);
     vec3 sourceReflection=textureLod(uReferenceReflection,-reflect(sourceEye,worldN),material.roughness*8.).rgb;
     ${groundBounce?'float reflectedDown=clamp(clamp(pow(1.-worldN.y,2.),0.,1.)*.75+material.roughness*.5,0.,1.);sourceReflection*=mix(vec3(1.),mix(vec3(1.),groundTint,fade),reflectedDown);':''}
     vec2 brdf=texture2D(uReferenceBrdf,vec2(ndv,1.-material.roughness)).rg;
     reflectedLight.indirectSpecular=ambientLightColor*sourceReflection*(fresnel*brdf.x+brdf.y)*max(.1,sourceAO*sourceAO);
    }
   `);
 }
 attach(material:Material){
  const sourceShader=material.userData.sourceShader;
  const previous=material.onBeforeCompile,key=material.customProgramCacheKey.bind(material);
  material.onBeforeCompile=(s,r)=>{
   previous.call(material,s,r);s.uniforms.uReferenceHeight=this.texture;s.uniforms.uReferenceGrid=this.grid;s.uniforms.uReferenceLayout=this.layout;s.uniforms.uReferenceDimensions=this.dimensions;
   s.vertexShader=s.vertexShader.replace('#include <common>',`#include <common>
    uniform sampler2D uReferenceHeight;uniform vec2 uReferenceGrid;uniform vec4 uReferenceLayout;uniform vec2 uReferenceDimensions;
    float referenceHeight(vec2 world){
     vec2 p=clamp((world-uReferenceLayout.xy)*uReferenceLayout.zw,vec2(0.),uReferenceDimensions-1.);
     vec2 i=floor(p),f=fract(p),uv=(i+.5)/uReferenceDimensions,d=1./uReferenceDimensions;
     return mix(mix(texture2D(uReferenceHeight,uv).r,texture2D(uReferenceHeight,uv+vec2(d.x,0.)).r,f.x),mix(texture2D(uReferenceHeight,uv+vec2(0.,d.y)).r,texture2D(uReferenceHeight,uv+d).r,f.x),f.y);
    }
   `).replace('#include <project_vertex>',`
    vec4 referenceWorld=vec4(transformed,1.);
    #ifdef USE_INSTANCING
     referenceWorld=instanceMatrix*referenceWorld;
    #endif
    referenceWorld=modelMatrix*referenceWorld;
    ${sourceShader==='plant'?`
    mat4 referenceTransform=modelMatrix;
    #ifdef USE_INSTANCING
     referenceTransform=modelMatrix*instanceMatrix;
    #endif
    vec3 referenceUp=normalize(referenceTransform[1].xyz);
    referenceWorld.y=referenceHeight(referenceWorld.xz)+dot(referenceWorld.xyz-referenceTransform[3].xyz,referenceUp);
    `:sourceShader==='model'?`
    referenceWorld.y=mix(referenceHeight(referenceWorld.xz)+position.y,referenceWorld.y,clamp((position.y-2.)/2.,0.,1.));
    `:'referenceWorld.y=referenceHeight(referenceWorld.xz)+.018;'}
    vec4 mvPosition=viewMatrix*referenceWorld;
    gl_Position=projectionMatrix*mvPosition;
   `).replace('#include <worldpos_vertex>','vec4 worldPosition=referenceWorld;');
  };
  material.customProgramCacheKey=()=>key()+'/reference-ground-v2-'+sourceShader;material.needsUpdate=true;
 }
 dispose(){this.releaseTextures();this.reflection.dispose();}
}
