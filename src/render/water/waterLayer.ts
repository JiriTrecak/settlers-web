import { DEFAULT_WATER_STYLE, type WaterStyle } from '../../shared/landscape/waterStyle';
import { riverFlow, type RiverStroke } from '../../shared/landscape/riverFlow';
import { Reflector } from 'three/addons/objects/Reflector.js';
/**
 * Synty Nature water: Unity Water_01 colors, depth fade from the height field,
 * dual-panned ripples, shore foam. Sunk 0.03 so dry land at 0 wins.
 */
import {
  ShaderChunk,
  ClampToEdgeWrapping,
  DataTexture,
  FloatType,
  Mesh,
  MeshStandardMaterial,
  NearestFilter, LinearFilter,
  NoColorSpace,
  PlaneGeometry,
  RedFormat,
  RepeatWrapping,
  RGBAFormat,
  TextureLoader,
  UnsignedByteType,
  Vector3,
  type Matrix4,
  type ShaderMaterial,
  type IUniform,
  type Scene,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { HEIGHT_ORIGIN, HEIGHT_VERTS, MAP_HALO, type HeightField } from "../../shared";
import waterNormalUrl from "../../../assets/synty/tex/Water_Normal.png?url";

const SINK = 0.03;

/** Water_01.mat — Shader Graph underscored names. */
const SHALLOW = new Vector3(0.43, 0.47, 0.57);
const DEEP = new Vector3(0.26, 0.32, 0.42);
const FOAM = new Vector3(0.86, 0.92, 0.9);

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
  private readonly flow=new DataTexture(riverFlow([],128,HEIGHT_ORIGIN,HEIGHT_VERTS-1),128,128);
  private readonly uniforms: WaterUniforms;
  private readonly mat: MeshStandardMaterial;
  private ripple: Texture | null = null;
  private readonly reflector: Reflector;

  constructor(scene: Scene, size: number) {
    const visLo = -MAP_HALO;
    const visHi = size + MAP_HALO;
    const span = visHi - visLo;
    const mid = (visLo + visHi) / 2;
    const data = new Float32Array(HEIGHT_VERTS * HEIGHT_VERTS);
    const tex = new DataTexture(data, HEIGHT_VERTS, HEIGHT_VERTS, RedFormat, FloatType);
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
      uHeightVerts: { value: HEIGHT_VERTS },
      uShallow: { value: SHALLOW },
      uDeep: { value: DEEP },
      uFoam: { value: FOAM },
      uTime: { value: 0 },
      uRipple: { value: flatNormal() },
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
    mat.customProgramCacheKey = () => "utc-river-water-v1";
    const mesh = new Mesh(new PlaneGeometry(span, span), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(mid, -SINK, mid);
    mesh.receiveShadow = true;
    mesh.name = "water";
    scene.add(mesh);
    this.mesh = mesh;
    this.mat = mat;
    mesh.onBeforeRender=(renderer,renderScene,camera,geometry,material,group)=>{
      if(this.uniforms.uReflectionStrength.value<=0)return;
      this.reflector.position.copy(mesh.position);
      this.reflector.quaternion.copy(mesh.quaternion);
      this.reflector.updateMatrixWorld(true);
      // The water must not appear in its own reflected scene.
      mesh.visible=false;
      try{this.reflector.onBeforeRender(renderer,renderScene,camera,geometry,material,group);}
      finally{mesh.visible=true;}
    };
    void this.loadRipple();
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
    this.flow.image.data=riverFlow(rivers,128,HEIGHT_ORIGIN,HEIGHT_VERTS-1);this.flow.needsUpdate=true;
  }

  setFrom(field: HeightField): void {
    const img = this.tex.image;
    if (img.data !== field.samples) {
      img.data = field.samples;
      img.width = HEIGHT_VERTS;
      img.height = HEIGHT_VERTS;
    }
    this.tex.needsUpdate = true;
    this.uniforms.uWaterLevel.value = field.waterLevel;
    this.mesh.position.y = field.waterLevel - SINK;
  }

  setLevel(level: number): void {
    const y = Number.isFinite(level) ? level : 0;
    this.uniforms.uWaterLevel.value = y;
    this.mesh.position.y = y - SINK;
  }

  destroy(scene: Scene): void {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.tex.dispose();this.flow.dispose();
    this.reflector.geometry.dispose();this.reflector.dispose();
    const dummy = this.uniforms.uRipple.value;
    this.ripple?.dispose();
    if (dummy !== this.ripple) dummy.dispose();
  }

  private async loadRipple(): Promise<void> {
    try {
      const tex = await new TextureLoader().loadAsync(waterNormalUrl);
      tex.wrapS = RepeatWrapping;
      tex.wrapT = RepeatWrapping;
      tex.colorSpace = NoColorSpace;
      tex.needsUpdate = true;
      const prev = this.uniforms.uRipple.value;
      this.ripple = tex;
      this.uniforms.uRipple.value = tex;
      if (prev !== tex) prev.dispose();
    } catch {
      /* procedural ripples still run */
    }
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

function flatNormal(): DataTexture {
  const data = new Uint8Array([128, 128, 255, 255, 128, 128, 255, 255, 128, 128, 255, 255, 128, 128, 255, 255]);
  const tex = new DataTexture(data, 2, 2, RGBAFormat, UnsignedByteType);
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

`;

const WATER_LOOK = /* glsl */ `
{
  float depth = uWaterLevel - terrainAt(vWorldPos.xz);
  if (depth < 0.015) discard;
  vec2 p=vWorldPos.xz;
  float t=uTime;
  vec2 flow=normalize(texture2D(uFlow,(p-vec2(uHeightOrigin))/(uHeightVerts-1.0)).rg*2.0-1.0);
  
  // Small world-space slopes become view-space normals before Three's light evaluation.
  float sx=sin(p.x*1.7+p.y*.7+t*.8)*.055 + sin(p.x*3.3-p.y*1.4-t*1.1)*.025;
  float sz=cos(p.y*1.8+p.x*.8+t*.7)*.055 + cos(p.y*3.5-p.x*.9+t)*.025;
  vec3 rippleA=texture2D(uRipple,p*uRippleScale-flow*t*.013).xyz*2.0-1.0;
  vec3 rippleB=texture2D(uRipple,p*uRippleScale*.71+flow*t*.009+vec2(.37,.63)).xyz*2.0-1.0;
  vec3 ripple=rippleA*.65+rippleB*.35;
  vec3 worldN=normalize(vec3(sx+ripple.x*uRippleStrength,1.0,sz+ripple.y*uRippleStrength));
  normal=normalize(mat3(viewMatrix)*worldN);
  float waterT=1.0-exp(-depth*.65);
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
  float foamWidth=.38+.11*sin(p.x*2.5+p.y*1.6+t*1.4);
  float foam=(1.0-smoothstep(.025,foamWidth,depth)) * (.3+.7*smoothstep(-.4,.7,sin(p.x*.83+p.y*.61)+sin(p.y*1.2-p.x*.37)));
  float shoreWave=(1.0-smoothstep(.1,.6,depth))*pow(max(0.0,sin(depth*18.0-t*1.8+p.x*.4)),12.0)*.3;
  vec3 V=normalize(vViewPosition);
  float fres=pow(1.0-clamp(dot(normal,V),0.0,1.0),4.0);
  col=mix(col,vec3(.65,.68,.75),fres*.48);
  float foamAmount=clamp((foam+shoreWave*.4)*uFoamStrength,0.0,1.0);
  col=mix(col,uFoam,foamAmount);
  diffuseColor.rgb=col;
  // Both color and coverage obey the brush's foam strength. Shallow coverage
  // approaches zero continuously so the shore meets the bed without a rim.
  diffuseColor.a=clamp(mix(.6,.95,waterT)*smoothstep(.015,.2,depth)+foamAmount*.35,0.0,1.0);
  roughnessFactor=.48;
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
