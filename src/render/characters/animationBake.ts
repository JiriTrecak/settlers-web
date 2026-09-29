/**
 * Baked skeletal animation for unit crowds. Every clip is sampled once at load at BAKE_FPS; each
 * bone's skinning matrix (relative to the model root) goes into one float texture, so the GPU
 * skins any number of instances from `(clip frame, clip frame, blend)` with no per-unit mixer,
 * skeleton update or bone-texture upload. Socket transforms are baked alongside on the CPU for
 * cargo, blade trails and projectile origins.
 *
 * Skinning matrix per slot, identical to three's SkinnedMesh:
 *   S = root⁻¹ · meshWorld · bindMatrixInverse · boneWorld · boneInverse · bindMatrix
 * so a root-space vertex is Σ wᵢ Sᵢ · position. Primitives with a different bind get their own
 * slot range. Texture layout is 1D (3 RGBA texels = rows of a 3×4 matrix, frame-major) folded
 * into TEXTURE_WIDTH columns.
 */
import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  FloatType,
  Matrix4,
  NearestFilter,
  PropertyBinding,
  Quaternion,
  RGBAFormat,
  SkinnedMesh,
  Vector3,
  type AnimationClip,
  type Interpolant,
  type Material,
  type Object3D,
} from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const BAKE_FPS = 30;
const TEXTURE_WIDTH = 2048;

export type BakedClip = { name: string; start: number; frames: number; duration: number };
export type BakedPrimitive = { name: string; geometry: BufferGeometry; material: Material; renderOrder: number };
export type BakedSocket = { rest: Matrix4; frames: Float32Array };
export type CharacterBake = {
  texture: DataTexture;
  width: number;
  slots: number;
  clips: ReadonlyMap<string, BakedClip>;
  sockets: ReadonlyMap<string, BakedSocket>;
  primitives: readonly BakedPrimitive[];
  /** All primitives merged, depth attributes only; null when they cannot merge. */
  shadow: BufferGeometry | null;
  /** The model root's own local transform, which a live clone would keep on its "Body". */
  rootPosition: Vector3;
  rootQuaternion: Quaternion;
  dispose(): void;
};

/** Which meshes a live instance would show for this variant (`setVariant` role rule). */
function shownFor(node: Object3D, root: Object3D, variant: string) {
  for (let o: Object3D | null = node; o; o = o === root ? null : o.parent) {
    if (!o.visible) return false;
    const role = o.userData.role;
    if (role && role !== "base" && role !== variant) return false;
  }
  return true;
}

/** Parallel pre-order lists: SkeletonUtils.clone preserves hierarchy order. */
function nodes(root: Object3D) {
  const list: Object3D[] = [];
  root.traverse((o) => list.push(o));
  return list;
}

/**
 * Null when the rig needs the live path: morph targets, rigid meshes, speech bones or more than
 * one skeleton. `scene` is the loaded prototype (after material batching); it is not modified.
 */
export function bakeCharacter(scene: Object3D, clips: readonly AnimationClip[], variant: string): CharacterBake | null {
  const source = nodes(scene);
  const meshes: SkinnedMesh[] = [];
  let supported = clips.length > 0;
  for (const o of source) {
    if (o.userData.speechRig) supported = false;
    if (!(o as SkinnedMesh).isMesh || !shownFor(o, scene, variant)) continue;
    const mesh = o as SkinnedMesh;
    if (!mesh.isSkinnedMesh || Array.isArray(mesh.material) || mesh.geometry.morphAttributes.position || !mesh.geometry.attributes.skinIndex) supported = false;
    else meshes.push(mesh);
  }
  const bones = meshes[0]?.skeleton.bones;
  if (!supported || !bones || meshes.some((m) => m.skeleton.bones.length !== bones.length || m.skeleton.bones.some((b, i) => b !== bones[i]))) return null;

  // Primitives sharing an attached bind share one slot range.
  const groups: SkinnedMesh[] = [], groupOf = new Map<SkinnedMesh, number>();
  for (const mesh of meshes) {
    const same = groups.findIndex((g) => g.bindMode === "attached" && mesh.bindMode === "attached" && g.bindMatrix.equals(mesh.bindMatrix) && g.skeleton.boneInverses.every((m, i) => m.equals(mesh.skeleton.boneInverses[i]!)));
    if (same >= 0) groupOf.set(mesh, same);
    else { groupOf.set(mesh, groups.length); groups.push(mesh); }
  }
  const slots = groups.length * bones.length;

  const rig = clone(scene), rigNodes = nodes(rig);
  const cloneOf = new Map(source.map((o, i) => [o, rigNodes[i]!]));
  rig.updateMatrixWorld(true);
  const rootInverse = rig.matrixWorld.clone().invert();
  const rest = rigNodes.map((o) => ({ o, p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() }));
  const socketNodes = rigNodes.filter((o) => /^socket/i.test(o.name));
  const sockets = new Map<string, BakedSocket>();
  for (const s of socketNodes) sockets.set(s.name, { rest: rootInverse.clone().multiply(s.matrixWorld), frames: new Float32Array(0) });

  const table = new Map<string, BakedClip>();
  let total = 0;
  for (const clip of clips) {
    const frames = Math.max(2, Math.ceil(clip.duration * BAKE_FPS) + 1);
    table.set(clip.name, { name: clip.name, start: total, frames, duration: clip.duration });
    total += frames;
  }
  const texels = total * slots * 3, width = Math.min(TEXTURE_WIDTH, texels), height = Math.ceil(texels / width);
  const data = new Float32Array(width * height * 4);
  for (const socket of sockets.values()) socket.frames = new Float32Array(total * 12);

  const rigGroups = groups.map((g) => cloneOf.get(g) as SkinnedMesh);
  const rigBones = bones.map((b) => cloneOf.get(b)!);
  const inverses = groups.map((g) => g.skeleton.boneInverses);
  const m = new Matrix4(), bone = new Matrix4();
  const writeRows = (out: Float32Array, offset: number, e: ArrayLike<number>) => {
    // Matrix4.elements is column-major; store rows (e[r], e[r+4], e[r+8], e[r+12]).
    for (let r = 0; r < 3; r++) { out[offset + r * 4] = e[r]!; out[offset + r * 4 + 1] = e[r + 4]!; out[offset + r * 4 + 2] = e[r + 8]!; out[offset + r * 4 + 3] = e[r + 12]!; }
  };
  for (const clip of clips) {
    const baked = table.get(clip.name)!;
    for (const r of rest) { r.o.position.copy(r.p); r.o.quaternion.copy(r.q); r.o.scale.copy(r.s); }
    const tracks = clip.tracks.flatMap((track) => {
      const parsed = PropertyBinding.parseTrackName(track.name);
      const node = PropertyBinding.findNode(rig, parsed.nodeName) as Object3D | undefined;
      const property = parsed.propertyName;
      if (!node || (property !== "position" && property !== "quaternion" && property !== "scale")) return [];
      // createInterpolant is assigned per track (GLTFLoader swaps in its cubic-spline one); untyped in three's d.ts.
      const interpolant = (track as unknown as { createInterpolant(): Interpolant }).createInterpolant();
      return [{ target: node[property], interpolant }];
    });
    for (let f = 0; f < baked.frames; f++) {
      const time = Math.min(clip.duration, f / BAKE_FPS);
      for (const t of tracks) t.target.fromArray(t.interpolant.evaluate(time) as unknown as number[]);
      rig.updateMatrixWorld(true);
      const frame = baked.start + f;
      for (let g = 0; g < rigGroups.length; g++) {
        const mesh = rigGroups[g]!;
        for (let b = 0; b < rigBones.length; b++) {
          bone.multiplyMatrices(rigBones[b]!.matrixWorld, inverses[g]![b]!).multiply(mesh.bindMatrix);
          m.multiplyMatrices(rootInverse, mesh.matrixWorld).multiply(mesh.bindMatrixInverse).multiply(bone);
          writeRows(data, ((frame * slots + g * rigBones.length + b) * 3) * 4, m.elements);
        }
      }
      for (const s of socketNodes) writeRows(sockets.get(s.name)!.frames, frame * 12, m.multiplyMatrices(rootInverse, s.matrixWorld).elements);
    }
  }

  const texture = new DataTexture(data, width, height, RGBAFormat, FloatType);
  texture.name = "Baked character bones";
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  // Batch geometry shares the prototype's vertex buffers; only the skin attributes are renamed
  // (and re-based when a primitive owns a later slot range).
  const primitives = meshes.map((mesh): BakedPrimitive => {
    const g = new BufferGeometry(), src = mesh.geometry, base = groupOf.get(mesh)! * bones.length;
    for (const [name, attribute] of Object.entries(src.attributes)) if (name !== "skinIndex" && name !== "skinWeight") g.setAttribute(name, attribute);
    let index = src.attributes.skinIndex as BufferAttribute;
    if (base) { const a = new Float32Array(index.count * 4); for (let i = 0; i < a.length; i++) a[i] = index.array[i]! + base; index = new BufferAttribute(a, 4); }
    g.setAttribute("bakedIndex", index);
    g.setAttribute("bakedWeight", src.attributes.skinWeight!);
    g.setIndex(src.index);
    return { name: mesh.name, geometry: g, material: mesh.material as Material, renderOrder: mesh.renderOrder };
  });
  const depth = primitives.map((p) => {
    const g = new BufferGeometry();
    for (const name of ["position", "bakedIndex", "bakedWeight"]) {
      const a = p.geometry.attributes[name] as BufferAttribute, f = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) f[i * a.itemSize + c] = a.getComponent(i, c);
      g.setAttribute(name, new BufferAttribute(f, a.itemSize));
    }
    if (p.geometry.index) g.setIndex(p.geometry.index.clone());
    return g;
  });
  const shadow = depth.length && depth.every((g) => !!g.index === !!depth[0]!.index) ? mergeGeometries(depth) : null;
  depth.forEach((g) => g.dispose());

  return {
    texture, width, slots, clips: table, sockets, primitives, shadow,
    rootPosition: scene.position.clone(), rootQuaternion: scene.quaternion.clone(),
    dispose() { texture.dispose(); shadow?.dispose(); },
  };
}

/** Root-space socket matrix at a frame position (fractional frames interpolate). */
export function bakedSocketAt(socket: BakedSocket, frame: number, out: Float32Array, offset = 0) {
  const f = Math.floor(frame), t = frame - f, a = f * 12, b = a + 12, d = socket.frames;
  for (let i = 0; i < 12; i++) out[offset + i] = t > 0 ? d[a + i]! + (d[b + i]! - d[a + i]!) * t : d[a + i]!;
}

/** Root-space skinning matrix of one slot, as the vertex shader evaluates it (for tests/tools). */
export function bakedSlotAt(bake: CharacterBake, frame: number, slot: number, out: Matrix4) {
  const data = bake.texture.image.data as Float32Array;
  const read = (f: number, r: number, c: number) => data[((f * bake.slots + slot) * 3 + r) * 4 + c]!;
  const f = Math.floor(frame), t = frame - f, v = (r: number, c: number) => t > 0 ? read(f, r, c) + (read(f + 1, r, c) - read(f, r, c)) * t : read(f, r, c);
  return out.set(v(0, 0), v(0, 1), v(0, 2), v(0, 3), v(1, 0), v(1, 1), v(1, 2), v(1, 3), v(2, 0), v(2, 1), v(2, 2), v(2, 3), 0, 0, 0, 1);
}
