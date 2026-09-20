import {BufferAttribute,BufferGeometry,Color,DataTexture,DepthTexture,FloatType,Frustum,Group,HalfFloatType,LinearFilter,Matrix4,Mesh,PCFShadowMap,RedFormat,Scene,ShaderMaterial,SRGBColorSpace,UnsignedIntType,Vector2,Vector3,WebGLRenderTarget,type Camera,type DirectionalLight,type WebGLRenderer} from 'three';
import type {DaytimeSample} from '../../shared/environment/dayCycle';
import type {ImportedTerrain} from '../../shared/map/importedTerrain';
import {sourceHeight,unpackSourceBytes} from '../../shared/map/importedTerrain';
import {sourceWater} from '../../shared/map/importedWater';
import {referenceTexture} from '../terrain/referenceTerrain';
import {sourceReflection} from '../terrain/sourceReflection';
import {sourceWaterFragment,sourceWaterVertex} from './sourceWaterShaders';
import {SourceWaterReflections} from './sourceWaterReflections';
import {SourceCaustics} from './sourceCaustics';
import wavesUrl from '../../../assets/library/asset.unregistered.textures.reference.scouring.env_water_waves__d_a_uncmp.png/albedo.png?url';

/** Original block topology, height/flow maps and water shader in a separate pass.
 * The opaque scene is drawn once; water reads a color/depth copy, never its own target. */
export class ImportedWater {
 readonly group=new Group();
 private readonly scene=new Scene();
 private readonly caustics=new SourceCaustics();
 private readonly screenReflections=new SourceWaterReflections();
 private readonly frustum=new Frustum();
 private readonly viewProjection=new Matrix4();
 private readonly causticsView=new Matrix4();
 private readonly sunDirection=new Vector3();
 private readonly sunTarget=new Vector3();
 private readonly up=new Vector3(0,1,0);
 private readonly zero=new Vector3();
 private readonly reflection=sourceReflection();
 get ready(){return Promise.all([this.reflection.ready,this.waves.referenceReady,this.caustics.ready]).then(()=>{}); }
 private readonly opaque=new WebGLRenderTarget(1,1,{type:HalfFloatType,depthBuffer:true});
 private readonly material:ShaderMaterial;
 private readonly time={value:0};
 private readonly flow:DataTexture;
 private readonly ground:DataTexture;
 private readonly groundColor:DataTexture;
 private readonly waves=referenceTexture(wavesUrl,false);
 constructor(_scene:Scene,readonly source:ImportedTerrain){
  const water=sourceWater(source),terrain=sourceHeight(source),[hw,hh]=source.heightSize;
  this.flow=new DataTexture(water.flow,water.width,water.depth);this.flow.minFilter=this.flow.magFilter=LinearFilter;this.flow.needsUpdate=true;
  const heights=new Float32Array(hw*hh);for(let i=0;i<heights.length;i++)heights[i]=terrain.values[i]!*64/65535+source.heightOffset;
  this.ground=new DataTexture(heights,hw,hh,RedFormat,FloatType);this.ground.needsUpdate=true;
  const color=source.groundColor;
  this.groundColor=color?new DataTexture(unpackSourceBytes(color.rgba),...color.size):new DataTexture(new Uint8Array([128,128,128,255]),1,1);
  this.groundColor.minFilter=this.groundColor.magFilter=LinearFilter;this.groundColor.needsUpdate=true;
  this.opaque.depthTexture=new DepthTexture(1,1,UnsignedIntType);
  this.material=new ShaderMaterial({vertexShader:sourceWaterVertex,fragmentShader:sourceWaterFragment,toneMapped:false,
   defines:{USE_SHADOWMAP:1,SHADOWMAP_TYPE_VSM:1},uniforms:{
    uSourceWaterGroundColor:{value:this.groundColor},uUseGroundColor:{value:!!source.groundColor},uSunDirection:{value:this.sunDirection},uSourceWaterTime:this.time,uSourceWaterFlow:{value:this.flow},uSourceWaterGround:{value:this.ground},uSourceWaterWaves:{value:this.waves},
    uSourceWaterOrigin:{value:new Vector2(...source.origin)},uSourceWaterSize:{value:new Vector2(water.width,water.depth)},uSourceWaterOffset:{value:new Vector2(source.origin[0]-source.sourceOrigin[0],source.origin[1]-source.sourceOrigin[1])},
    uOpaqueColor:{value:this.opaque.texture},uOpaqueDepth:{value:this.opaque.depthTexture},uViewport:{value:new Vector2()},uInverseProjection:{value:new Matrix4()},uCameraWorld:{value:new Matrix4()},
    uSourceReflections:{value:this.screenReflections.target.texture},uSourceHeightOffset:{value:source.heightOffset},uSourceCaustics:{value:this.caustics.target.texture},uCausticsView:{value:this.causticsView},uReflectionCube:{value:this.reflection.texture},uDirectLight:{value:new Color()},uAmbientLight:{value:new Color()},uViewDirection:{value:new Vector3()},
    uSunShadow:{value:null},uShadowSize:{value:new Vector2()},uShadowMatrix:{value:new Matrix4()},uHasShadow:{value:false},uShadowBias:{value:0},uShadowRadius:{value:1},
   }});
  for(const block of source.water){
   const positions=new Float32Array(17*17*3),indices:number[]=[];
   for(let z=0;z<=16;z++)for(let x=0;x<=16;x++){
    const wx=source.origin[0]+block.x*16+x,wz=source.origin[1]+block.z*16+z,i=(z*17+x)*3;
    positions[i]=wx;positions[i+1]=water.sample(wx,wz);positions[i+2]=wz;
   }
   for(let z=0;z<16;z++)for(let x=0;x<16;x++){const a=z*17+x,b=a+1,c=a+17,d=c+1;indices.push(a,c,b,b,c,d);}
   const geometry=new BufferGeometry();geometry.setAttribute('position',new BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeBoundingSphere();if(geometry.boundingSphere)geometry.boundingSphere.radius+=4;
   this.screenReflections.add(geometry);
   const mesh=new Mesh(geometry,this.material);mesh.name=`source-water.${block.x}.${block.z}`;this.group.add(mesh);
  }
  this.scene.add(this.group);
 }
 render(gl:WebGLRenderer,target:WebGLRenderTarget,camera:Camera,sun:DirectionalLight,daytime?:DaytimeSample){
  if(!target.depthTexture)return;
  this.viewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  this.frustum.setFromProjectionMatrix(this.viewProjection);
  if(!this.group.children.some(object=>this.frustum.intersectsObject(object)))return;
  this.caustics.render(gl,this.time.value);
  // The original caustics-view matrix is an engine uniform, absent from the pack.
  // Use a translation-invariant sun-aligned basis until an original frame verifies it.
  sun.getWorldPosition(this.sunDirection);sun.target.getWorldPosition(this.sunTarget);
  this.sunDirection.sub(this.sunTarget).normalize();
  this.causticsView.lookAt(this.sunDirection,this.zero,this.up).transpose();
  const u=this.material.uniforms,filtered=gl.shadowMap.type===PCFShadowMap;
  if(!!this.material.defines.SHADOWMAP_TYPE_PCF!==filtered){this.material.defines={USE_SHADOWMAP:1,[filtered?'SHADOWMAP_TYPE_PCF':'SHADOWMAP_TYPE_VSM']:1};this.material.needsUpdate=true;}
  if(this.opaque.width!==target.width||this.opaque.height!==target.height)this.opaque.setSize(target.width,target.height);
  gl.initRenderTarget(this.opaque);
  gl.copyTextureToTexture(target.texture,this.opaque.texture);
  gl.copyTextureToTexture(target.depthTexture,this.opaque.depthTexture!);
  // copyTextureToTexture changes framebuffer bindings; restore through renderer state.
  gl.setRenderTarget(target);
  this.screenReflections.render(gl,camera,this.opaque.texture,this.opaque.depthTexture!,target.width,target.height);
  u.uViewport.value.set(target.width,target.height);u.uInverseProjection.value.copy(camera.projectionMatrix).invert();u.uCameraWorld.value.copy(camera.matrixWorld);
  camera.getWorldDirection(u.uViewDirection.value);
  u.uDirectLight.value.copy(sun.color).multiplyScalar(sun.intensity/Math.PI);
  const ambient=daytime?.look.ambient;
  if(ambient)u.uAmbientLight.value.setRGB(ambient.rgb[0]/255,ambient.rgb[1]/255,ambient.rgb[2]/255,SRGBColorSpace).multiplyScalar(ambient.multiplier);
  else u.uAmbientLight.value.setScalar(.4);
  u.uHasShadow.value=gl.shadowMap.enabled&&!!sun.shadow.map;
  u.uSunShadow.value=filtered?sun.shadow.map?.depthTexture??null:sun.shadow.map?.texture??null;
  u.uShadowSize.value.copy(sun.shadow.mapSize);u.uShadowMatrix.value.copy(sun.shadow.matrix);u.uShadowBias.value=sun.shadow.bias;u.uShadowRadius.value=sun.shadow.radius;
  const clear=gl.autoClear,shadowAuto=gl.shadowMap.autoUpdate;
  try{gl.autoClear=false;gl.shadowMap.autoUpdate=false;gl.render(this.scene,camera);}
  finally{gl.autoClear=clear;gl.shadowMap.autoUpdate=shadowAuto;}
 }
 diagnostics(gl:WebGLRenderer){return this.screenReflections.diagnostics(gl);}
 tick(now:number){this.time.value=now*.001;}
 dispose(){this.group.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});this.material.dispose();this.flow.dispose();this.ground.dispose();this.groundColor.dispose();this.waves.dispose();this.opaque.dispose();this.reflection.dispose();this.caustics.dispose();this.screenReflections.dispose();}
}
