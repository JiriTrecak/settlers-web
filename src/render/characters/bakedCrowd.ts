/**
 * Instanced drawing for baked characters (see animationBake.ts). Per asset: one InstancedMesh
 * per material and one merged depth caster, so draws stay constant however many units are on
 * screen. Units are plain Object3D stand-ins ("Body" + socket nodes) that the settlement layer
 * positions as before; `flush()` packs every visible one into shared instance buffers.
 *
 * Instance data: `instanceMatrix` (unit body), `bakedFrames` (current frame, previous frame,
 * previous weight), `bakedTeam` (linear player colour, weight 0 keeps the authored colour).
 */
import {
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshDepthMaterial,
  MeshStandardMaterial,
  Object3D,
  type Material,
} from "three";
import type { AssetDefinition } from "../../shared/authoring/asset";
import type { AnimationClip } from "three";
import { PLAYER_COLORS } from "../../shared/player/player";
import { prepareMaskedTeamColor } from "../settlement/maskedTeamColor.js";
import { TEAM_COLOR_MATERIAL } from "../settlement/playerMaterials";
import { bakeCharacter, bakedSocketAt, type BakedSocket, type CharacterBake } from "./animationBake";
import { BakedAnimator } from "./bakedAnimator";
import {CONCEALMENT_DISCARD} from './concealment';

/** `?liveUnits` keeps every unit on the SkinnedMesh path, for A/B checks of the bake. Read once. */
const LIVE_UNITS = typeof location !== "undefined" && new URLSearchParams(location.search).has("liveUnits");

const BAKED_VERTEX = /* glsl */ `
uniform highp sampler2D bakedBones;
uniform int bakedWidth;
uniform int bakedSlots;
attribute vec4 bakedIndex;
attribute vec4 bakedWeight;
attribute vec4 bakedFrames;
attribute vec4 bakedTeam;
attribute float bakedVisibility;
varying float utcConcealment;
mat4 bakedRead( int frame, int slot ) {
  int i = ( frame * bakedSlots + slot ) * 3;
  vec4 a = texelFetch( bakedBones, ivec2( i % bakedWidth, i / bakedWidth ), 0 ); i++;
  vec4 b = texelFetch( bakedBones, ivec2( i % bakedWidth, i / bakedWidth ), 0 ); i++;
  vec4 c = texelFetch( bakedBones, ivec2( i % bakedWidth, i / bakedWidth ), 0 );
  return mat4( a.x, b.x, c.x, 0.0, a.y, b.y, c.y, 0.0, a.z, b.z, c.z, 0.0, a.w, b.w, c.w, 1.0 );
}
mat4 bakedAt( float frame, int slot ) {
  float f = floor( frame ), t = frame - f;
  mat4 m = bakedRead( int( f ), slot );
  if ( t > 0.0 ) m += ( bakedRead( int( f ) + 1, slot ) - m ) * t;
  return m;
}
// bakedFrames: current, fade, fade frame; w packs both fade weights (see BakedAnimator.frames).
vec2 bakedBlend() {
  float low = mod( bakedFrames.w, 1024.0 );
  return vec2( low, ( bakedFrames.w - low ) / 1024.0 ) / 1023.0;
}
mat4 bakedBone( int slot, vec2 blend ) {
  mat4 m = bakedAt( bakedFrames.x, slot );
  if ( blend.x + blend.y <= 0.0 ) return m;
  m *= 1.0 - blend.x - blend.y;
  m += blend.x * bakedAt( bakedFrames.y, slot );
  if ( blend.y > 0.0 ) m += blend.y * bakedAt( bakedFrames.z, slot );
  return m;
}
mat4 bakedSkin() {
  vec2 blend = bakedBlend();
  mat4 m = bakedWeight.x * bakedBone( int( bakedIndex.x ), blend );
  if ( bakedWeight.y > 0.0 ) m += bakedWeight.y * bakedBone( int( bakedIndex.y ), blend );
  if ( bakedWeight.z > 0.0 ) m += bakedWeight.z * bakedBone( int( bakedIndex.z ), blend );
  if ( bakedWeight.w > 0.0 ) m += bakedWeight.w * bakedBone( int( bakedIndex.w ), blend );
  return m;
}
`;

type Uniforms = { bakedBones: { value: CharacterBake["texture"] }; bakedWidth: { value: number }; bakedSlots: { value: number } };

/** Replaces three's skinning chunks with texture skinning; team materials take the instance colour. */
function patchBaked(material: Material, uniforms: Uniforms, team: boolean) {
  const prior = material.onBeforeCompile, key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    prior.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${BAKED_VERTEX}${team ? "varying vec4 vBakedTeam;\n" : ""}`)
      .replace("#include <skinbase_vertex>", `utcConcealment=bakedVisibility;mat4 bakedMatrix = bakedSkin();${team ? " vBakedTeam = bakedTeam;" : ""}`)
      .replace("#include <skinnormal_vertex>", "objectNormal = mat3( bakedMatrix ) * objectNormal;\n#ifdef USE_TANGENT\nobjectTangent = mat3( bakedMatrix ) * objectTangent;\n#endif")
      .replace("#include <skinning_vertex>", "transformed = ( bakedMatrix * vec4( transformed, 1.0 ) ).xyz;");
    shader.fragmentShader='varying float utcConcealment;\n'+shader.fragmentShader.replace('void main() {','void main() {\n'+CONCEALMENT_DISCARD);
    if (team)
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec4 vBakedTeam;")
        .replace("vec4 diffuseColor = vec4( diffuse, opacity );", "vec4 diffuseColor = vec4( mix( diffuse, vBakedTeam.rgb, vBakedTeam.a ), opacity );");
  };
  material.customProgramCacheKey = () => key + "|baked-skin-v2" + (team ? "-team" : "");
  material.needsUpdate = true;
}

/** One unit's scene stand-in. `body` is what a live rig's root would be; sockets hang under it. */
export class BakedUnit {
  readonly body = new Group();
  private readonly sockets: Array<{ node: Object3D; data: BakedSocket }> = [];
  private readonly frameData = new Float32Array(4);
  private readonly rows = new Float32Array(12);
  private readonly blended = new Float32Array(12);

  constructor(readonly crowd: AssetCrowd, readonly entity: number, readonly player: BakedAnimator) {
    this.body.name = "Body";
    this.body.position.copy(crowd.bake.rootPosition);
    this.body.quaternion.copy(crowd.bake.rootQuaternion);
    for (const [name, data] of crowd.bake.sockets) {
      const node = new Object3D();
      node.name = name;
      node.matrixAutoUpdate = false;
      node.matrix.copy(data.rest);
      this.body.add(node);
      this.sockets.push({ node, data });
    }
  }

  /** Socket nodes follow the baked pose (same blend as the shader); call after the animator advanced. */
  pose() {
    if (!this.sockets.length) return;
    const f = this.frameData;
    this.player.frames(f, 0);
    const low = f[3]! % 1024, weights = [low / 1023, (f[3]! - low) / 1024 / 1023];
    for (const { node, data } of this.sockets) {
      bakedSocketAt(data, f[0]!, this.rows);
      if (weights[0]! + weights[1]! > 0) {
        for (let i = 0; i < 12; i++) this.rows[i] = this.rows[i]! * (1 - weights[0]! - weights[1]!);
        for (let k = 0; k < 2; k++) {
          if (!weights[k]) continue;
          bakedSocketAt(data, f[k + 1]!, this.blended);
          for (let i = 0; i < 12; i++) this.rows[i] = this.rows[i]! + this.blended[i]! * weights[k]!;
        }
      }
      const r = this.rows;
      node.matrix.set(r[0]!, r[1]!, r[2]!, r[3]!, r[4]!, r[5]!, r[6]!, r[7]!, r[8]!, r[9]!, r[10]!, r[11]!, 0, 0, 0, 1);
      node.matrixWorldNeedsUpdate = true;
    }
  }

  /** Shown when its holder is in the scene and neither it nor its body is hidden. */
  visible() {
    const holder = this.body.parent;
    return !!holder?.parent && holder.visible && this.body.visible;
  }

  dispose() {
    this.crowd.units.delete(this);
    this.body.removeFromParent();
  }
}

class AssetCrowd {
  readonly units = new Set<BakedUnit>();
  readonly batches: InstancedMesh[] = [];
  readonly shadow: InstancedMesh | null;
  private readonly materials: Material[] = [];
  private capacity = 0;
  private matrices!: InstancedBufferAttribute;
  private frames!: InstancedBufferAttribute;
  private team!: InstancedBufferAttribute;
  private visibility!: InstancedBufferAttribute;
  private readonly matrix = new Matrix4();
  private readonly color = new Color();

  constructor(readonly bake: CharacterBake, readonly clips: readonly AnimationClip[], readonly root: Object3D, readonly variant: string, readonly capabilities: AssetDefinition["capabilities"] | undefined, parent: Object3D, name: string) {
    const uniforms: Uniforms = { bakedBones: { value: bake.texture }, bakedWidth: { value: bake.width }, bakedSlots: { value: bake.slots } };
    for (const p of bake.primitives) {
      const material = p.material.clone();
      const team = material.name === TEAM_COLOR_MATERIAL;
      if (material instanceof MeshStandardMaterial) prepareMaskedTeamColor(material);
      patchBaked(material, uniforms, team);
      this.materials.push(material);
      const mesh = new InstancedMesh(p.geometry, material, 0);
      mesh.name = `${name} · ${p.name}`;
      mesh.frustumCulled = false;
      mesh.castShadow = !bake.shadow;
      mesh.receiveShadow = true;
      mesh.renderOrder = p.renderOrder;
      mesh.raycast = () => {};
      this.batches.push(mesh);
    }
    if (bake.shadow) {
      // Hidden outside the shadow pass (like the live rigs' shadow proxies); side matches them.
      const material = new MeshBasicMaterial({ side: DoubleSide });
      const depth = new MeshDepthMaterial();
      patchBaked(depth, uniforms, false);
      this.materials.push(material, depth);
      this.shadow = new InstancedMesh(bake.shadow, material, 0);
      this.shadow.name = `${name} · shadow`;
      this.shadow.customDepthMaterial = depth;
      this.shadow.frustumCulled = false;
      this.shadow.castShadow = true;
      this.shadow.visible = false;
      this.shadow.raycast = () => {};
    } else this.shadow = null;
    this.grow(16);
    for (const mesh of this.meshes()) { mesh.visible = false; parent.add(mesh); }
  }

  meshes() { return this.shadow ? [...this.batches, this.shadow] : this.batches; }

  private grow(capacity: number) {
    this.capacity = capacity;
    this.matrices = new InstancedBufferAttribute(new Float32Array(capacity * 16), 16).setUsage(DynamicDrawUsage);
    this.frames = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(DynamicDrawUsage);
    this.team = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(DynamicDrawUsage);
    this.visibility = new InstancedBufferAttribute(new Float32Array(capacity).fill(1), 1).setUsage(DynamicDrawUsage);
    for (const mesh of this.meshes()) {
      mesh.instanceMatrix = this.matrices;
      mesh.geometry.setAttribute("bakedFrames", this.frames);
      mesh.geometry.setAttribute("bakedTeam", this.team);
      mesh.geometry.setAttribute("bakedVisibility", this.visibility);
    }
  }

  /** Visible units first; the camera-hidden body goes last so only the shadow draw includes it. */
  flush(cameraHidden: number | null) {
    if (this.units.size > this.capacity) this.grow(2 ** Math.ceil(Math.log2(this.units.size)));
    let count = 0, hidden: BakedUnit | null = null;
    for (const unit of this.units) {
      if (!unit.visible()) continue;
      if (unit.entity === cameraHidden) { hidden = unit; continue; }
      this.write(unit, count++);
    }
    const main = count;
    if (hidden) this.write(hidden, count++);
    for (const mesh of this.batches) { mesh.count = main; mesh.visible = main > 0; }
    if (this.shadow) this.shadow.count = count;
    if (!count) return;
    for (const [attribute, size] of [[this.matrices, 16], [this.frames, 4], [this.team, 4], [this.visibility, 1]] as const) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, count * size);
      attribute.needsUpdate = true;
    }
  }

  showShadow(show: boolean) {
    if (this.shadow) this.shadow.visible = show && this.shadow.count > 0;
  }

  private write(unit: BakedUnit, i: number) {
    const body = unit.body, holder = body.parent!;
    this.visibility.setX(i,holder.userData.concealmentOpacity??1);
    holder.updateMatrix();
    body.updateMatrix();
    this.matrix.multiplyMatrices(holder.parent!.matrixWorld, holder.matrix).multiply(body.matrix);
    this.matrix.toArray(this.matrices.array, i * 16);
    unit.player.frames(this.frames.array as Float32Array, i * 4);
    const owner = holder.userData.materialOwner as number | undefined;
    const t = this.team.array;
    if (owner === undefined || owner < 0) t[i * 4 + 3] = 0;
    else {
      this.color.set(PLAYER_COLORS[owner % PLAYER_COLORS.length]!);
      t[i * 4] = this.color.r; t[i * 4 + 1] = this.color.g; t[i * 4 + 2] = this.color.b; t[i * 4 + 3] = 1;
    }
  }

  /** Single-instance copies sharing geometry and materials, so warm-up links these programs. */
  warmModels(): Object3D[] {
    return this.meshes().map((mesh) => {
      const warm = new InstancedMesh(mesh.geometry, mesh === this.shadow ? mesh.customDepthMaterial! : mesh.material, 1);
      warm.instanceMatrix = this.matrices;
      warm.frustumCulled = false;
      return warm;
    });
  }

  dispose() {
    for (const mesh of this.meshes()) mesh.removeFromParent();
    for (const p of this.bake.primitives) p.geometry.dispose();
    for (const m of this.materials) m.dispose();
    this.bake.dispose();
  }
}

/** Baked unit rendering for the settlement layer. Assets that cannot bake stay on the live path. */
export class BakedCrowd {
  private readonly assets = new Map<string, AssetCrowd | null>();
  private readonly root = new Group();

  constructor(parent: Object3D) {
    this.root.name = "baked-units";
    this.root.matrixAutoUpdate = false;
    parent.add(this.root);
  }

  /** Bakes once per asset id; false when the rig needs the live path. */
  register(asset: string, scene: Object3D, clips: readonly AnimationClip[], variant: string, capabilities?: AssetDefinition["capabilities"]) {
    if (this.assets.has(asset)) return !!this.assets.get(asset);
    const bake = LIVE_UNITS ? null : bakeCharacter(scene, clips, variant,capabilities?.sockets?.map(s=>s.node));
    this.assets.set(asset, bake ? new AssetCrowd(bake, clips, scene, variant, capabilities, this.root, asset) : null);
    return !!bake;
  }

  create(asset: string, entity: number) {
    const crowd = this.assets.get(asset);
    if (!crowd) return null;
    const unit = new BakedUnit(crowd, entity, BakedAnimator.create(crowd.bake, crowd.root, crowd.clips, crowd.variant, crowd.capabilities));
    crowd.units.add(unit);
    return { root: unit.body, player: unit.player, pose: () => unit.pose(), dispose: () => unit.dispose() };
  }

  flush(cameraHidden: number | null) {
    for (const crowd of this.assets.values()) crowd?.flush(cameraHidden);
  }

  showShadows(show: boolean) {
    for (const crowd of this.assets.values()) crowd?.showShadow(show);
  }

  warmModels() {
    return [...this.assets.values()].flatMap((crowd) => crowd?.warmModels() ?? []);
  }

  get units() {
    let n = 0;
    for (const crowd of this.assets.values()) n += crowd?.units.size ?? 0;
    return n;
  }

  dispose() {
    for (const crowd of this.assets.values()) crowd?.dispose();
    this.assets.clear();
    this.root.removeFromParent();
  }
}
