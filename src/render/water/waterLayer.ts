import {perf} from '../../debug/performance';
import { DEFAULT_WATER_STYLE, type WaterStyle } from '../../shared/landscape/waterStyle';
import { riverFlow, type RiverStroke } from '../../shared/landscape/riverFlow';
import { Reflector } from 'three/addons/objects/Reflector.js';
/**
 * Forest stream: blue-gray depth, procedural flowing ripples and broken crests.
 * Sunk 0.03 so dry land at 0 wins.
 */
import {
  ShaderChunk,
  ClampToEdgeWrapping,
  DataTexture,
  FloatType,
  Mesh,
  MeshStandardMaterial,
  MeshDepthMaterial,
  NearestFilter, LinearFilter,
  NoColorSpace,
  PlaneGeometry,
  RedFormat,
  RepeatWrapping,
  RGBAFormat,
  UnsignedByteType,
  Vector3,
  Matrix4, Box3, Frustum, type Camera,
  type ShaderMaterial,
  type IUniform,
  type Scene,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { HEIGHT_ORIGIN, MAP_HALO, type HeightField } from "../../shared";

const SINK = 0.03;

/** Linear working-space colors sampled toward the approved stream reference. */
const SHALLOW = new Vector3(0.105, 0.22, 0.23);
const DEEP = new Vector3(0.02, 0.045, 0.08);
const FOAM = new Vector3(0.73, 0.77, 0.78);

type WaterUniforms = {
  uShadowStrength:IUniform<number>;
  uReflectionStrength:IUniform<number>;
  uReflection:IUniform<Texture>;
  uReflectionMatrix:IUniform<Matrix4>;
  uCausticStrength:IUniform<number>; uRippleScale:IUniform<number>; uRippleStrength:IUniform<number>; uCloudStrength:IUniform<number>; uFoamStrength:IUniform<number>;
  uHeight: IUniform<DataTexture>;
  uFlow: IUniform<DataTexture>;
  uWaterLevel: IUniform<number>;
  uHeightOrigin: IUniform<number>;
  uHeightVerts: IUniform<number>;
  uShallow: IUniform<Vector3>;
  uDeep: IUniform<Vector3>;
  uFoam: IUniform<Vector3>;
  uTime: IUniform<number>;
  uRipple: IUniform<Texture>;
};

export class WaterLayer {
  readonly mesh: Mesh;
  private readonly tex: DataTexture;
  private readonly flow:DataTexture;
  private readonly verts:number;
  private readonly uniforms: WaterUniforms;
  private readonly mat: MeshStandardMaterial;
  private readonly reflector: Reflector;
  private wetBounds:Box3[]=[];
  private field:HeightField|null=null;
  private frustum=new Frustum();
  private projection=new Matrix4();
  private lastReflection=-Infinity;
  private reflectionView=new Matrix4();
  updateVisibility(camera:Camera):void {
    camera.updateMatrixWorld();this.projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projection);
    this.mesh.visible=this.wetBounds.some(box=>this.frustum.intersectsBox(box));
    perf.value('Water visible',this.mesh.visible?'Yes':'No');
  }
  private rebuildWetBounds():void {
    const field=this.field;if(!field)return;const occupied=new Set<string>();
    for(let z=0;z<this.verts;z++)for(let x=0;x<this.verts;x++)if(field.samples[z*this.verts+x]!<=this.mesh.position.y+.08)occupied.add(`${Math.floor((x+HEIGHT_ORIGIN)/4)},${Math.floor((z+HEIGHT_ORIGIN)/4)}`);
    this.wetBounds=[...occupied].map(key=>{const [x,z]=key.split(',').map(Number);return new Box3(new Vector3(x!*4-1,this.mesh.position.y-.1,z!*4-1),new Vector3(x!*4+5,this.mesh.position.y+.1,z!*4+5));});
    this.lastReflection=-Infinity;
  }

  constructor(scene: Scene, size: number) {
    this.verts=size+MAP_HALO*2+1;
    this.flow=new DataTexture(riverFlow([],128,HEIGHT_ORIGIN,this.verts-1),128,128);
    const visLo = -MAP_HALO;
    const visHi = size + MAP_HALO;
    const span = visHi - visLo;
    const mid = (visLo + visHi) / 2;
    const data = new Float32Array(this.verts * this.verts);
    const tex = new DataTexture(data, this.verts, this.verts, RedFormat, FloatType);
    tex.colorSpace = NoColorSpace;
    tex.minFilter = NearestFilter;
    tex.magFilter = NearestFilter;
    tex.wrapS = ClampToEdgeWrapping;
    tex.wrapT = ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.unpackAlignment = 1;
    tex.needsUpdate = true;
    this.tex = tex;
    this.flow.minFilter=this.flow.magFilter=LinearFilter;this.flow.needsUpdate=true;
    this.reflector=new Reflector(new PlaneGeometry(1,1),{textureWidth:768,textureHeight:768,clipBias:.003,multisample:0});
    this.uniforms = {
      uShadowStrength:{value:.6},
      uReflectionStrength:{value:0},
      uReflection:{value:this.reflector.getRenderTarget().texture},
      uReflectionMatrix:(this.reflector.material as ShaderMaterial).uniforms.textureMatrix as IUniform<Matrix4>,
      uCausticStrength:{value:.4},uRippleScale:{value:DEFAULT_WATER_STYLE.rippleScale},uRippleStrength:{value:DEFAULT_WATER_STYLE.rippleStrength},uCloudStrength:{value:DEFAULT_WATER_STYLE.cloudStrength},uFoamStrength:{value:DEFAULT_WATER_STYLE.foamStrength},
      uHeight: { value: tex },
      uFlow: { value: this.flow },
      uWaterLevel: { value: 0 },
      uHeightOrigin: { value: HEIGHT_ORIGIN },
      uHeightVerts: { value: this.verts },
      uShallow: { value: SHALLOW },
      uDeep: { value: DEEP },
      uFoam: { value: FOAM },
      uTime: { value: 0 },
      uRipple: { value: proceduralRipple() },
    };
    const mat = new MeshStandardMaterial({
      color: 0x4c6c6a,
      roughness: 0.3,
      metalness: 0.02,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });
    mat.onBeforeCompile = (shader) => this.patch(shader);
    mat.customProgramCacheKey = () => "utc-forest-stream-v12";
    const mesh = new Mesh(new PlaneGeometry(span, span), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(mid, -SINK, mid);
    mesh.receiveShadow = true;
    // VSM renders receivers into its depth pass even with castShadow=false.
    // A transparent water surface must not occlude the riverbed below it.
    const shadowDepth = new MeshDepthMaterial();
    shadowDepth.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <clipping_planes_fragment>',
        '#include <clipping_planes_fragment>\n discard;',
      );
    };
    shadowDepth.customProgramCacheKey = () => 'water-no-shadow-depth';
    mesh.customDepthMaterial = shadowDepth;
    mesh.name = "water";
    scene.add(mesh);
    this.mesh = mesh;
    this.mat = mat;
    mesh.onBeforeRender=(renderer,renderScene,camera,geometry,material,group)=>{
      if(this.uniforms.uReflectionStrength.value<=0)return;
      const now=performance.now();
      const view=new Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
      // Update immediately when panning; static-camera reflections need only 15 Hz.
      if(now-this.lastReflection<1000/15&&this.reflectionView.equals(view))return;
      this.lastReflection=now;this.reflectionView.copy(view);
      const timing=perf.start();
      this.reflector.position.copy(mesh.position);
      this.reflector.quaternion.copy(mesh.quaternion);
      this.reflector.updateMatrixWorld(true);
      // The water must not appear in its own reflected scene.
      mesh.visible=false;
      try{this.reflector.onBeforeRender(renderer,renderScene,camera,geometry,material,group);}
      finally{mesh.visible=true;perf.end('Water reflection (CPU)',timing);}
    };
  }

  setStyle(style:WaterStyle=DEFAULT_WATER_STYLE):void {
    this.uniforms.uReflectionStrength.value=style.reflectionStrength??0;
    this.uniforms.uShadowStrength.value=style.shadowStrength??.6;
    this.uniforms.uCausticStrength.value=style.causticStrength??.4;this.uniforms.uRippleScale.value=style.rippleScale;this.uniforms.uRippleStrength.value=style.rippleStrength;this.uniforms.uCloudStrength.value=style.cloudStrength;this.uniforms.uFoamStrength.value=style.foamStrength;
  }

  tick(nowMs: number): void {
    this.uniforms.uTime.value = nowMs * 0.001;
  }

  setFlow(rivers:readonly RiverStroke[]):void {
    this.flow.image.data=riverFlow(rivers,128,HEIGHT_ORIGIN,this.verts-1);this.flow.needsUpdate=true;
  }

  setFrom(field: HeightField): void {
    this.field=field;
    const img = this.tex.image;
    if (img.data !== field.samples) {
      img.data = field.samples;
      img.width = this.verts;
      img.height = this.verts;
    }
    this.tex.needsUpdate = true;
    this.uniforms.uWaterLevel.value = field.waterLevel;
    this.mesh.position.y = field.waterLevel - SINK;
    this.rebuildWetBounds();
  }

  setLevel(level: number): void {
    const y = Number.isFinite(level) ? level : 0;
    this.uniforms.uWaterLevel.value = y;
    this.mesh.position.y = y - SINK;
    this.rebuildWetBounds();
  }

  destroy(scene: Scene): void {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.customDepthMaterial?.dispose();
    this.mat.dispose();
    this.tex.dispose();this.flow.dispose();
    this.reflector.geometry.dispose();this.reflector.dispose();
    this.uniforms.uRipple.value.dispose();
  }

  private patch(shader: WebGLProgramParametersWithUniforms): void {
    Object.assign(shader.uniforms, this.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vWorldPos;
varying vec4 vReflection;
uniform mat4 uReflectionMatrix;`,
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vReflection = uReflectionMatrix * vec4(transformed,1.0);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `${WATER_COMMON}\n#include <common>`)
      .replace("#include <lights_fragment_begin>", ShaderChunk.lights_fragment_begin.replaceAll("directionalLightShadow.shadowIntensity,", "directionalLightShadow.shadowIntensity * uShadowStrength,"))
      .replace("#include <opaque_fragment>", `#include <opaque_fragment>\n${WATER_REFLECTION}`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>\n${WATER_LOOK}`);
  }
}

function proceduralRipple(): DataTexture {
  // Analytic periodic slopes: original texture, seamless on both axes.
  const size=128,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size*Math.PI*2,v=y/size*Math.PI*2;
    const dx=.30*Math.cos(u*3+v*2)+.15*Math.cos(u*7-v*3)+.08*Math.sin(u*13+v*5);
    const dz=.42*Math.cos(u*3+v*2)-.21*Math.cos(u*7-v*3)+.11*Math.sin(u*13+v*5);
    const length=Math.hypot(dx,dz,1),i=(y*size+x)*4;
    data[i]=Math.round((dx/length*.5+.5)*255);data[i+1]=Math.round((dz/length*.5+.5)*255);
    data[i+2]=Math.round((1/length*.5+.5)*255);data[i+3]=255;
  }
  const tex = new DataTexture(data,size,size,RGBAFormat,UnsignedByteType);
  tex.minFilter=tex.magFilter=LinearFilter;
  tex.colorSpace = NoColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

const WATER_COMMON = /* glsl */ `
varying vec3 vWorldPos;
varying vec4 vReflection;
uniform sampler2D uReflection;
uniform float uReflectionStrength;
uniform float uShadowStrength;
uniform sampler2D uHeight;
uniform sampler2D uFlow;
uniform sampler2D uRipple;
uniform float uWaterLevel;
uniform float uHeightOrigin;
uniform float uHeightVerts;
uniform float uTime;
uniform float uRippleScale,uRippleStrength,uCloudStrength,uFoamStrength,uCausticStrength;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFoam;

float terrainAt(vec2 xz) {
  vec2 f = xz - vec2(uHeightOrigin);
  vec2 i0 = floor(f);
  vec2 t = f - i0;
  float n = uHeightVerts;
  vec2 uv = (i0 + 0.5) / n;
  float s = 1.0 / n;
  float a = texture2D(uHeight, uv).r;
  float b = texture2D(uHeight, uv + vec2(s, 0.0)).r;
  float c = texture2D(uHeight, uv + vec2(0.0, s)).r;
  float d = texture2D(uHeight, uv + vec2(s, s)).r;
  // Match HeightMesh's a-c-b / b-c-d diagonal exactly. Bilinear height
  // disagrees with the visible triangles and exposes sawtooth shore fringes.
  return t.x+t.y<=1.0
    ? a+(b-a)*t.x+(c-a)*t.y
    : d+(c-d)*(1.0-t.x)+(b-d)*(1.0-t.y);
}

float waterHash(vec2 p) {
  return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);
}
float waterNoise(vec2 p) {
  vec2 cell=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(waterHash(cell),waterHash(cell+vec2(1.0,0.0)),f.x),
             mix(waterHash(cell+vec2(0.0,1.0)),waterHash(cell+vec2(1.0,1.0)),f.x),f.y);
}
float waterCloud(vec2 p) {
  vec2 bend=vec2(waterNoise(p*.43),waterNoise(p*.43+vec2(17.3,4.1)))-.5;
  p+=bend*.8;
  return .65*waterNoise(p)+.25*waterNoise(p*2.13+vec2(7.1,3.4))+.1*waterNoise(p*4.37);
}

float streamFilaments(vec2 drifting,vec2 flow){
  vec2 uv=drifting*2.15;
  vec2 warp=vec2(waterNoise(uv*.34),waterNoise(uv*.34+7.3))-.5;
  uv+=warp*1.35;
  // Convolve in the local current direction without rotating world coordinates.
  // Continuous world-space samples stay coherent through a bend in the river.
  vec2 along=flow*1.4;
  float contour=waterNoise(uv)*.34;
  contour+=(waterNoise(uv+along)+waterNoise(uv-along))*.23;
  contour+=(waterNoise(uv+along*2.)+waterNoise(uv-along*2.))*.10;
  float width=max(.004,fwidth(contour)*.7);
  float crest=smoothstep(.55-width,.65+width,contour);
  float patches=smoothstep(.42,.68,waterCloud(drifting*.43+vec2(7.1,3.2)));
  float fragments=smoothstep(.32,.62,waterNoise(drifting*.9+vec2(9.1,3.4)));
  float breakup=smoothstep(.25,.6,waterNoise(uv*1.8+vec2(3.2,7.8)));
  return crest*patches*fragments*breakup;
}

`;

const WATER_LOOK = /* glsl */ `
{
  float depth = uWaterLevel - terrainAt(vWorldPos.xz);
  if (depth < 0.015) discard;
  vec2 p=vWorldPos.xz;
  float t=uTime;
  vec2 flow=normalize(texture2D(uFlow,(p-vec2(uHeightOrigin))/(uHeightVerts-1.0)).rg*2.0-1.0);
  
  // Small world-space slopes become view-space normals before Three's light evaluation.
  float sx=sin(p.x*1.7+p.y*.7+t*.8)*.018 + sin(p.x*3.3-p.y*1.4-t*1.1)*.009;
  float sz=cos(p.y*1.8+p.x*.8+t*.7)*.018 + cos(p.y*3.5-p.x*.9+t)*.009;
  vec2 rippleUv=p*uRippleScale*vec2(.28,1.35);
  vec3 rippleA=texture2D(uRipple,rippleUv-flow*t*.013).xyz*2.0-1.0;
  vec3 rippleB=texture2D(uRipple,rippleUv*.71+flow*t*.009+vec2(.37,.63)).xyz*2.0-1.0;
  vec3 ripple=rippleA*.65+rippleB*.35;
  vec3 worldN=normalize(vec3((sx+ripple.x*.35)*uRippleStrength,1.0,(sz+ripple.y)*uRippleStrength));
  normal=normalize(mat3(viewMatrix)*worldN);
  float waterT=smoothstep(.6,2.6,depth);
  vec3 col=mix(uShallow,uDeep,waterT);
  float causticA=sin(p.x*3.1+sin(p.y*2.4+t*.55)+t*.35);
  float causticB=sin(p.y*3.5+sin(p.x*2.2-t*.45)-t*.3);
  float caustics=pow(1.0-abs(causticA*causticB),16.0);
  // Sample along the local flow without rotating absolute world UVs;
  // this stretches variation through bends without seams between flow cells.
  vec2 drift=p*.18-flow*t*.006;
  vec2 stretch=flow*.55;
  float cloud=(waterCloud(drift)*.4+waterCloud(drift+stretch)*.3+waterCloud(drift-stretch)*.3-.5)*2.0;
  col+=vec3(1.0,1.08,1.2)*uCloudStrength*cloud;
  col+=vec3(.12,.2,.16)*caustics*exp(-depth*.8)*uCausticStrength;
  // Flow-aligned, warped filaments. A broad envelope breaks the crests into
  // short silver streaks rather than a bank-to-bank stripe pattern.
  // Two overlapping advection phases avoid jumps and unbounded distortion.
  float phaseA=fract(t*.035),phaseB=fract(t*.035+.5);
  float flowBlend=abs(phaseA*2.0-1.0);
  float glints=mix(streamFilaments(p-flow*phaseA*3.0,flow),streamFilaments(p-flow*phaseB*3.0,flow),flowBlend);
  glints*=smoothstep(.10,.55,depth);
  col=mix(col,vec3(.63,.72,.78),glints*(.18+sqrt(uRippleStrength)*.85));
  float broadBands=waterCloud(p*.25-flow*t*.01);
  col+=vec3(.45,.57,.65)*(broadBands-.5)*max(.035,uCloudStrength);
  float foamWidth=.28+.20*waterNoise(p*1.7+flow*t*.025);
  float foam=(1.0-smoothstep(foamWidth*.78,foamWidth,depth)) * smoothstep(.48,.72,waterCloud(p*2.1-flow*t*.03));
  float shoreWave=(1.0-smoothstep(.1,.6,depth))*waterCloud(p*1.7-flow*t*.08)*.12;
  vec3 V=normalize(vViewPosition);
  float fres=pow(1.0-clamp(dot(normal,V),0.0,1.0),4.0);
  col=mix(col,vec3(.65,.68,.75),fres*.48);
  float foamAmount=clamp((foam+shoreWave*.4)*uFoamStrength,0.0,1.0);
  col=mix(col,uFoam,foamAmount);
  diffuseColor.rgb=col;
  // Both color and coverage obey the brush's foam strength. Shallow coverage
  // approaches zero continuously so the shore meets the bed without a rim.
  float waterAlpha=mix(.48,.90,waterT)*smoothstep(.015,.2,depth);
  diffuseColor.a=mix(waterAlpha,.94,foamAmount);
  roughnessFactor=.58;
}
`;

// Composite scene radiance after water lighting so reflected trees are not lit twice.
const WATER_REFLECTION = /* glsl */ `
if(uReflectionStrength>0.0){
  vec2 reflectionUv=vReflection.xy/vReflection.w;
  vec2 distortion=(texture2D(uRipple,vWorldPos.xz*uRippleScale+uTime*.002).rg-.5)*uRippleStrength*.025;
  reflectionUv=clamp(reflectionUv+distortion,vec2(.002),vec2(.998));
  // A two-dimensional soft reflection avoids five separated copies of foliage.
  // The wide footprint reads as reflected canopy masses at the game's camera.
  vec2 blur=vec2(.012,.009);
  vec3 reflected=texture2D(uReflection,reflectionUv).rgb*.25;
  reflected+=(texture2D(uReflection,reflectionUv+vec2(blur.x,0.0)).rgb
    +texture2D(uReflection,reflectionUv-vec2(blur.x,0.0)).rgb
    +texture2D(uReflection,reflectionUv+vec2(0.0,blur.y)).rgb
    +texture2D(uReflection,reflectionUv-vec2(0.0,blur.y)).rgb)*.125;
  reflected+=(texture2D(uReflection,reflectionUv+blur).rgb
    +texture2D(uReflection,reflectionUv-blur).rgb
    +texture2D(uReflection,reflectionUv+vec2(blur.x,-blur.y)).rgb
    +texture2D(uReflection,reflectionUv+vec2(-blur.x,blur.y)).rgb)*.0625;
  float reflectionDepth=uWaterLevel-terrainAt(vWorldPos.xz);
  gl_FragColor.rgb=mix(gl_FragColor.rgb,reflected,uReflectionStrength*smoothstep(.1,1.0,reflectionDepth));
}
`;
