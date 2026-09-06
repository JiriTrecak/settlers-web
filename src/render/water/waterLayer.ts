/**
 * Water plane at waterLevel. Depth from the height field: dirt brown at the
 * lip (same as the plate), dark blue in the basin. Flat — no waves. Sunk 0.03 so dry land at 0 wins.
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
  Vector3,
  type IUniform,
  type Scene,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { HEIGHT_ORIGIN, HEIGHT_VERTS, MAP_HALO, type HeightField } from "../../shared";
import { DIRT } from "../height/heightMesh";

const SINK = 0.03;
const TEAL = 0x2a3a44;
const SHORE = new Vector3(((DIRT >> 16) & 255) / 255, ((DIRT >> 8) & 255) / 255, (DIRT & 255) / 255);

type WaterUniforms = {
  uHeight: IUniform<DataTexture>;
  uWaterLevel: IUniform<number>;
  uHeightOrigin: IUniform<number>;
  uHeightVerts: IUniform<number>;
  uShore: IUniform<Vector3>;
};

export class WaterLayer {
  readonly mesh: Mesh;
  private readonly tex: DataTexture;
  private readonly uniforms: WaterUniforms;
  private readonly mat: MeshStandardMaterial;

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
      uShore: { value: SHORE },
    };
    const mat = new MeshStandardMaterial({
      color: TEAL,
      roughness: 0.28,
      metalness: 0.04,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });
    mat.onBeforeCompile = (shader) => this.patch(shader);
    mat.customProgramCacheKey = () => "utc-water-blue";
    const mesh = new Mesh(new PlaneGeometry(span, span), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(mid, -SINK, mid);
    mesh.receiveShadow = true;
    mesh.name = "water";
    scene.add(mesh);
    this.mesh = mesh;
    this.mat = mat;
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
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>\n${WATER_TINT}`);
  }
}

const WATER_COMMON = /* glsl */ `
varying vec3 vWorldPos;
uniform sampler2D uHeight;
uniform float uWaterLevel;
uniform float uHeightOrigin;
uniform float uHeightVerts;
uniform vec3 uShore;

// Manual bilinear so we don't need float-linear filtering (Mac WebGL2).
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
`;

const WATER_TINT = /* glsl */ `
{
  float depth = uWaterLevel - terrainAt(vWorldPos.xz);
  if (depth < 0.01) {
    diffuseColor.a = 0.0;
  } else {
    vec3 deep = vec3(0.10, 0.24, 0.42);
    float t = smoothstep(0.02, 0.7, depth);
    vec3 col = mix(uShore, deep, t);
    vec3 V = normalize(vViewPosition);
    float fres = pow(1.0 - clamp(dot(normal, V), 0.0, 1.0), 3.0);
    col = mix(col, vec3(0.32, 0.48, 0.64), fres * 0.16);
    float alpha = mix(0.58, 0.94, t);
    diffuseColor.rgb = col;
    diffuseColor.a = alpha;
  }
}
`;
