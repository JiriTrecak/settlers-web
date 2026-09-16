import {perf} from '../../debug/performance';
import { DEFAULT_WATER_STYLE, type WaterStyle } from '../../shared/landscape/waterStyle';
import { riverFlow, type RiverStroke } from '../../shared/landscape/riverFlow';
import { Reflector } from 'three/addons/objects/Reflector.js';
/**
 * Forest stream: blue-gray depth, procedural flowing ripples and broken crests.
 * Sunk 0.03 so dry land at 0 wins.
 */
import {
  ShaderChunk, Color,
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
  uClarity:IUniform<number>;uFlowSpeed:IUniform<number>;
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
      uClarity:{value:3.2},uFlowSpeed:{value:.65},
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
      uShallow: { value: SHALLOW.clone() },
      uDeep: { value: DEEP.clone() },
      uFoam: { value: FOAM.clone() },
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
    mat.customProgramCacheKey = () => "utc-forest-stream-v13";
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
    const shallow=new Color(style.shallowColor??'#668378'),deep=new Color(style.deepColor??'#102f36');
    this.uniforms.uShallow.value.set(shallow.r,shallow.g,shallow.b);this.uniforms.uDeep.value.set(deep.r,deep.g,deep.b);
    this.uniforms.uClarity.value=style.clarity??3.2;this.uniforms.uFlowSpeed.value=style.flowSpeed??.65;
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
uniform float uClarity,uFlowSpeed;
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

// Moving cellular edges form caustic networks instead of a crossing sine grid.
float waterCaustic(vec2 p,float time){
 vec2 base=floor(p),f=fract(p);float first=8.,second=8.;
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
  vec2 offset=vec2(float(x),float(y)),cell=base+offset;
  vec2 seed=vec2(waterHash(cell),waterHash(cell+vec2(37.,19.)));
  vec2 site=.5+.28*sin(time*.45+seed*6.283185);
  float d=length(offset+site-f);
  if(d<first){second=first;first=d;}else second=min(second,d);
 }
 float edge=second-first,aa=max(.014,fwidth(edge));
 return 1.-smoothstep(.015-aa,.055+aa,edge);
}

`;

const WATER_LOOK = /* glsl */ `
{
 float depth=uWaterLevel-terrainAt(vWorldPos.xz);
 if(depth<.015)discard;
 vec2 p=vWorldPos.xz;float t=uTime*uFlowSpeed;
 vec2 flow=texture2D(uFlow,(p-vec2(uHeightOrigin))/(uHeightVerts-1.)).rg*2.-1.;
 flow=length(flow)>.01?normalize(flow):vec2(1.,0.);
 // Two advected phases cross-fade without resetting the current at a seam.
 float phase=fract(t*.045),other=fract(t*.045+.5),blend=abs(phase*2.-1.);
 vec2 uv=p*uRippleScale;
 vec2 a=texture2D(uRipple,uv-flow*phase*.45).rg*2.-1.;
 vec2 b=texture2D(uRipple,uv-flow*other*.45+vec2(.17,.39)).rg*2.-1.;
 vec2 small=texture2D(uRipple,p*uRippleScale*2.17+vec2(-t*.008,t*.006)).rg*2.-1.;
 vec2 slopes=(mix(a,b,blend)*.8+small*.2)*uRippleStrength;
 vec3 worldN=normalize(vec3(slopes.x,1.,slopes.y));
 normal=normalize(mat3(viewMatrix)*worldN);
 float shore=smoothstep(.015,.16,depth);
 float opticalDepth=depth/max(.2,uClarity);
 float absorption=1.-exp(-opticalDepth);
 vec3 col=mix(uShallow,uDeep,1.-exp(-opticalDepth*1.6));
 float broad=waterNoise(p*.12-flow*t*.008)-.5;
 col+=vec3(.12,.16,.14)*broad*uCloudStrength;
 float caustics=waterCaustic(p*.9-flow*t*.04,t);
 col+=vec3(.18,.23,.16)*caustics*exp(-depth*.9)*uCausticStrength;
 // Broken bank lacing stays at the waterline; open water has no painted white stripes.
 float bankNoise=waterNoise(p*2.3-flow*t*.13);
 float bank=(1.-smoothstep(.08,.36,depth))*smoothstep(.44,.72,bankNoise);
 float foam=bank*uFoamStrength;
 col=mix(col,uFoam,foam);
 diffuseColor.rgb=max(col,vec3(0.));
 diffuseColor.a=mix(clamp(absorption,.08,.94)*shore,.92,foam*shore);
 roughnessFactor=mix(.23,.6,foam);
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
  vec2 blur=vec2(.002,.002);
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
  float fresnel=.02+.98*pow(1.-clamp(dot(normal,normalize(vViewPosition)),0.,1.),5.);
  float reflection=uReflectionStrength*(.12+.88*fresnel)*smoothstep(.05,.5,reflectionDepth);
  gl_FragColor.rgb=mix(gl_FragColor.rgb,reflected,reflection);
}
`;
