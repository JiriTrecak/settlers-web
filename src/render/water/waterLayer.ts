/**
 * Synty Nature water: Unity Water_01 colors, depth fade from the height field,
 * dual-panned ripples, shore foam. Sunk 0.03 so dry land at 0 wins.
 */
import {
  ClampToEdgeWrapping,
  DataTexture,
  FloatType,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  NoColorSpace,
  PlaneGeometry,
  RedFormat,
  RepeatWrapping,
  RGBAFormat,
  TextureLoader,
  UnsignedByteType,
  Vector3,
  type IUniform,
  type Scene,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { HEIGHT_ORIGIN, HEIGHT_VERTS, MAP_HALO, type HeightField } from "../../shared";
import waterNormalUrl from "../../../assets/synty/tex/Water_Normal.png?url";

const SINK = 0.03;

/** Water_01.mat — Shader Graph underscored names. */
const SHALLOW = new Vector3(0.32, 0.44, 0.49);
const DEEP = new Vector3(0.12, 0.23, 0.30);
const FOAM = new Vector3(0.86, 0.92, 0.9);

type WaterUniforms = {
  uHeight: IUniform<DataTexture>;
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
  private readonly uniforms: WaterUniforms;
  private readonly mat: MeshStandardMaterial;
  private ripple: Texture | null = null;

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
    this.uniforms = {
      uHeight: { value: tex },
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
    void this.loadRipple();
  }

  tick(nowMs: number): void {
    this.uniforms.uTime.value = nowMs * 0.001;
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
    this.tex.dispose();
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
varying vec3 vWorldPos;`,
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `${WATER_COMMON}\n#include <common>`)
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
uniform sampler2D uHeight;
uniform sampler2D uRipple;
uniform float uWaterLevel;
uniform float uHeightOrigin;
uniform float uHeightVerts;
uniform float uTime;
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
  return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
}

vec3 rippleNormal(vec2 xz) {
  float t = uTime * 0.042;
  vec2 uv1 = xz * 0.175 + vec2(-t, t);
  vec2 uv2 = xz * 0.11 + vec2(t * 0.7, -t * 0.45);
  vec3 n1 = texture2D(uRipple, uv1).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(uRipple, uv2).xyz * 2.0 - 1.0;
  float ax = sin(xz.x * 2.4 - xz.y * 0.6 + t * 6.2) + sin(xz.y * 3.1 + t * 4.4) * 0.55;
  float az = cos(xz.y * 2.1 + xz.x * 0.5 - t * 5.1) + cos(xz.x * 1.7 - t * 3.6) * 0.45;
  return normalize(n1 + n2 * 0.65 + vec3(ax, 2.2, az));
}
`;

const WATER_LOOK = /* glsl */ `
{
  float depth = uWaterLevel - terrainAt(vWorldPos.xz);
  if (depth < 0.015) discard;
  vec2 p=vWorldPos.xz;
  float t=uTime;
  // Small world-space slopes become view-space normals before Three's light evaluation.
  float sx=sin(p.x*1.7+p.y*.7+t*.8)*.055 + sin(p.x*3.3-p.y*1.4-t*1.1)*.025;
  float sz=cos(p.y*1.8+p.x*.8+t*.7)*.055 + cos(p.y*3.5-p.x*.9+t)*.025;
  vec3 ripple=texture2D(uRipple,p*.13+vec2(t*.011,-t*.008)).xyz*2.0-1.0;
  vec3 worldN=normalize(vec3(sx+ripple.x*.07,1.0,sz+ripple.y*.07));
  normal=normalize(mat3(viewMatrix)*worldN);
  float waterT=1.0-exp(-depth*.65);
  vec3 col=mix(uShallow,uDeep,waterT);
  float causticA=sin(p.x*3.1+sin(p.y*2.4+t*.55)+t*.35);
  float causticB=sin(p.y*3.5+sin(p.x*2.2-t*.45)-t*.3);
  float caustics=pow(1.0-abs(causticA*causticB),16.0);
  float stream=sin((p.y-p.x*.55)*3.1+sin(p.x*.14+t*.15)*1.1-t*.65);
  float streak=pow(max(0.0,stream),24.0)*(.5+.5*sin(p.x*2.8+p.y*.6));
  col+=vec3(.065,.07,.075)*streak;
  col+=vec3(.12,.2,.16)*caustics*exp(-depth*.8)*.4;
  float foamWidth=.20+.09*sin(p.x*2.5+p.y*1.6+t*1.4);
  float foam=1.0-smoothstep(.025,foamWidth,depth);
  float shoreWave=(1.0-smoothstep(.1,.6,depth))*pow(max(0.0,sin(depth*18.0-t*1.8+p.x*.4)),12.0)*.3;
  vec3 V=normalize(vViewPosition);
  float fres=pow(1.0-clamp(dot(normal,V),0.0,1.0),4.0);
  col=mix(col,vec3(.55,.78,.82),fres*.48);
  col=mix(col,uFoam,clamp(foam+shoreWave,0.0,1.0));
  diffuseColor.rgb=col;
  diffuseColor.a=mix(.68,.95,waterT)+foam*.35;
  roughnessFactor=.28;
}
`;
