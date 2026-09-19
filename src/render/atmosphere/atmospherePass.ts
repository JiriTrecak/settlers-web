import type {DaytimeSample} from '../../shared/environment/dayCycle';
import {createAtmosphereNoise} from './noiseVolume';
import {createDaytimeLuts} from './daytimeLuts';
import {Color,SRGBColorSpace,DepthTexture,HalfFloatType,Matrix4,Mesh,NearestFilter,OrthographicCamera,PCFShadowMap,PlaneGeometry,Scene,ShaderMaterial,UnsignedIntType,Vector2,Vector3,Vector4,WebGLRenderTarget,type Camera,type DirectionalLight,type Texture,type WebGLRenderer} from 'three';
import {DEFAULT_SHAFT_TINT,type AtmosphereSettings} from '../../shared/landscape/atmosphere';
import {readAtmosphereQuality,type AtmosphereQuality} from '../../shared/settings/graphics';
import {perf} from '../../debug/performance';
import {compositeFragment,filterFragment,fullscreenVertex,marchFragment} from './shaders';

export const atmosphereQualitySpec=(quality:AtmosphereQuality)=>quality==='high'?{scale:.66,steps:40,maxPixels:900_000}:quality==='low'?{scale:.33,steps:16,maxPixels:180_000}:{scale:.5,steps:24,maxPixels:360_000};
export type AtmosphereFrame={daytime?:DaytimeSample;daytimeFogTint?:string;daytimeFogDistanceScale?:number;settings?:AtmosphereSettings;sun:DirectionalLight;visibility?:Texture;mapSize:number;waterLevel:number;time:number;windX:number;windZ:number;rain:number};
/** Bounded raymarch and depth-aware filter, then full-resolution composite. No history buffer. */
export class AtmospherePass {
 private readonly noiseVolume=createAtmosphereNoise();
 private readonly daytimeLuts=createDaytimeLuts();
 private readonly sceneTarget=new WebGLRenderTarget(1,1,{type:HalfFloatType,depthBuffer:true,samples:2});
 private readonly fogTarget=new WebGLRenderTarget(1,1,{type:HalfFloatType,depthBuffer:false,minFilter:NearestFilter,magFilter:NearestFilter});
 private readonly filteredTarget=new WebGLRenderTarget(1,1,{type:HalfFloatType,depthBuffer:false,minFilter:NearestFilter,magFilter:NearestFilter});
 private readonly quadScene=new Scene();
 private readonly camera=new OrthographicCamera(-1,1,1,-1,0,1);
 private readonly geometry=new PlaneGeometry(2,2);
 private readonly shared={sceneDepth:{value:null as Texture|null},inverseProjection:{value:new Matrix4()},cameraWorld:{value:new Matrix4()},waterLevel:{value:0},visibilityMap:{value:null as Texture|null},hasVisibility:{value:false},mapSize:{value:256}};
 private readonly march=new ShaderMaterial({vertexShader:fullscreenVertex,fragmentShader:marchFragment,depthTest:false,depthWrite:false,toneMapped:false,uniforms:{...this.shared,
  noiseVolume:{value:this.noiseVolume},sunShadow:{value:null as Texture|null},shadowMatrix:{value:new Matrix4()},hasShadow:{value:false},
  density:{value:0},baseHeight:{value:0},heightFalloff:{value:4},sunStrength:{value:1},noiseScale:{value:.1},noiseStrength:{value:.6},time:{value:0},driftSpeed:{value:.3},wind:{value:new Vector2()},
  fogColor:{value:new Color()},sunColor:{value:new Color()},sunDirection:{value:new Vector3()},regionCount:{value:0},regions:{value:Array.from({length:16},()=>new Vector4())},regionShapes:{value:Array.from({length:16},()=>new Vector4())},
 }});
 private readonly filter=new ShaderMaterial({vertexShader:fullscreenVertex,fragmentShader:filterFragment,depthTest:false,depthWrite:false,toneMapped:false,uniforms:{...this.shared,fogTexture:{value:this.fogTarget.texture},fogSize:{value:new Vector2()}}});
 private readonly composite=new ShaderMaterial({vertexShader:fullscreenVertex,fragmentShader:compositeFragment,depthTest:false,depthWrite:false,toneMapped:false,uniforms:{...this.shared,toneMappingExposure:{value:1},daytimeLutFrom:{value:this.daytimeLuts.textures.day},daytimeLutTo:{value:this.daytimeLuts.textures.day},daytimeLutBlend:{value:0},hasVolumetrics:{value:false},hasDaytimeFog:{value:false},daytimeFogColor:{value:new Color()},daytimeFogDensity:{value:0},daytimeFogDispersion:{value:0},daytimeFogStart:{value:0},daytimeFogHeight:{value:0},sceneColor:{value:this.sceneTarget.texture},fogTexture:{value:this.filteredTarget.texture},fogSize:{value:new Vector2()}}});
 private readonly quad=new Mesh(this.geometry,this.march);
 private shaderKey='';
 private readonly size=new Vector2();
 private readonly shaftTint=new Color();
 private readonly fogTint=new Color();
 constructor(){this.sceneTarget.depthTexture=new DepthTexture(1,1,UnsignedIntType);this.sceneTarget.texture.name='Atmosphere scene';this.fogTarget.texture.name='Volumetric fog';this.quad.frustumCulled=false;this.quadScene.add(this.quad);}
 render(gl:WebGLRenderer,scene:Scene,camera:Camera,frame:AtmosphereFrame,measure:(label:string,draw:()=>void)=>void=(_,draw)=>draw()):void {
  const quality=readAtmosphereQuality(),settings=frame.settings;
  const volumetrics=!!settings?.enabled&&quality!=='off';
  if(!volumetrics&&!frame.daytime){perf.value('Atmosphere','Off');perf.sample('GPU atmosphere',0);perf.sample('Atmosphere submit (CPU)',0);measure('GPU scene',()=>gl.render(scene,camera));return;}
  const {scale,steps,maxPixels}=atmosphereQualitySpec(quality);const destination=gl.getRenderTarget();if(destination)this.size.set(destination.width,destination.height);else gl.getDrawingBufferSize(this.size);
  if(this.sceneTarget.width!==this.size.x||this.sceneTarget.height!==this.size.y)this.sceneTarget.setSize(this.size.x,this.size.y);
  const boundedScale=Math.min(scale,Math.sqrt(maxPixels/(this.size.x*this.size.y)));
  const width=Math.max(1,Math.floor(this.size.x*boundedScale)),height=Math.max(1,Math.floor(this.size.y*boundedScale));
  if(volumetrics&&(this.fogTarget.width!==width||this.fogTarget.height!==height)){this.fogTarget.setSize(width,height);this.filteredTarget.setSize(width,height);}
  const filtered=gl.shadowMap.type===PCFShadowMap,key=`${filtered}/${steps}`;
  if(volumetrics&&key!==this.shaderKey){this.shaderKey=key;this.march.defines={STEPS:steps,...(filtered?{FILTERED_SHADOW:1}:{})};this.march.needsUpdate=true;}
  const previous=gl.getRenderTarget(),autoClear=gl.autoClear,shadowAuto=gl.shadowMap.autoUpdate;
  try{
   gl.autoClear=true;measure('GPU scene',()=>{gl.setRenderTarget(this.sceneTarget);gl.render(scene,camera);});
   const start=perf.start();
   // Scene render has updated both camera matrices and the current sun shadow.
   const u=this.march.uniforms,s=this.shared;
   s.sceneDepth.value=this.sceneTarget.depthTexture;s.inverseProjection.value.copy(camera.projectionMatrix).invert();s.cameraWorld.value.copy(camera.matrixWorld);
   s.waterLevel.value=frame.waterLevel;s.visibilityMap.value=frame.visibility??null;s.hasVisibility.value=!!frame.visibility;s.mapSize.value=frame.mapSize;
   if(volumetrics&&settings){
   u.hasShadow.value=gl.shadowMap.enabled&&!!frame.sun.shadow.map;
   u.sunShadow.value=filtered?frame.sun.shadow.map?.depthTexture??null:frame.sun.shadow.map?.texture??null;
   u.shadowMatrix.value.copy(frame.sun.shadow.matrix);
   u.density.value=settings.density;u.baseHeight.value=settings.baseHeight;u.heightFalloff.value=settings.heightFalloff;
   u.sunStrength.value=settings.sunStrength*(1-frame.rain*.65);
   u.noiseScale.value=settings.noiseScale;u.noiseStrength.value=settings.noiseStrength;u.driftSpeed.value=settings.driftSpeed;u.time.value=frame.time/1000;
   u.wind.value.set(frame.windX,frame.windZ);u.fogColor.value.set(settings.color);
   u.sunColor.value.copy(frame.sun.color).multiply(this.shaftTint.set(settings.sunTint??DEFAULT_SHAFT_TINT)).multiplyScalar(Math.min(2.5,frame.sun.intensity));
   u.sunDirection.value.subVectors(frame.sun.position,frame.sun.target.position).normalize();u.regionCount.value=settings.regions.length;
   settings.regions.forEach((r,i)=>{u.regions.value[i].set(r.x,r.y,r.z,r.density);u.regionShapes.value[i].set(r.radiusX,r.radiusY,r.radiusZ,0);});
   }
   const composite=this.composite.uniforms;composite.hasVolumetrics.value=volumetrics;composite.hasDaytimeFog.value=!!frame.daytime;
   if(frame.daytime){const lut=this.daytimeLuts.pair(frame.daytime);composite.daytimeLutFrom.value=lut.from;composite.daytimeLutTo.value=lut.to;composite.daytimeLutBlend.value=lut.blend;}
   if(frame.daytime){const f=frame.daytime.look.fog,scale=frame.daytimeFogDistanceScale??1;composite.daytimeFogColor.value.setRGB(f.color.rgb[0]/255,f.color.rgb[1]/255,f.color.rgb[2]/255,SRGBColorSpace).multiplyScalar(f.color.multiplier).multiply(this.fogTint.set(frame.daytimeFogTint??'#ffffff'));composite.daytimeFogDensity.value=f.density/scale;composite.daytimeFogDispersion.value=f.dispersionByHeight;composite.daytimeFogStart.value=f.startDist*scale;composite.daytimeFogHeight.value=f.startHeight;}
   measure('GPU atmosphere',()=>{
   gl.shadowMap.autoUpdate=false;
   if(volumetrics){this.quad.material=this.march;gl.setRenderTarget(this.fogTarget);gl.render(this.quadScene,this.camera);
   this.filter.uniforms.fogSize.value.set(width,height);this.quad.material=this.filter;gl.setRenderTarget(this.filteredTarget);gl.render(this.quadScene,this.camera);}
   this.composite.uniforms.toneMappingExposure.value=gl.toneMappingExposure;this.composite.uniforms.fogSize.value.set(width,height);this.quad.material=this.composite;gl.setRenderTarget(previous);gl.render(this.quadScene,this.camera);
   });
   perf.end('Atmosphere submit (CPU)',start);perf.value('Atmosphere',volumetrics?`${quality} · ${width} × ${height} · ${steps} samples`:'Daytime height fog · one composite');
  }finally{gl.setRenderTarget(previous);gl.autoClear=autoClear;gl.shadowMap.autoUpdate=shadowAuto;}
 }
 dispose(){this.daytimeLuts.dispose();this.noiseVolume.dispose();this.sceneTarget.dispose();this.fogTarget.dispose();this.filteredTarget.dispose();this.geometry.dispose();this.march.dispose();this.filter.dispose();this.composite.dispose();}
}
