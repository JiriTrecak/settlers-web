/**
 * Depth-only stand-ins for multi-material skinned rigs. A unit's primitives differ only in
 * material, which the shadow pass ignores (it swaps in a depth material), so one merged
 * SkinnedMesh on the same Skeleton replaces 3–8 shadow draws per unit with one.
 *
 * Proxies stay `visible = false`: three builds the main render list before the shadow pass,
 * so the owner shows them only around `shadowMap.render` and they never reach the main pass.
 * three layer-tests shadow casters against the *main* camera, so layers can't do this.
 */
import { BufferGeometry, DoubleSide, MeshBasicMaterial, SkinnedMesh, type Object3D } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { skinnedCasterDepth } from "../renderer/casterDepth";

const DEPTH_ATTRIBUTES = ["position", "skinIndex", "skinWeight"] as const;
/** Only `side` (and alpha maps, unused here) reach the depth material. Never drawn in colour. */
const material = new MeshBasicMaterial({ side: DoubleSide });
material.name = "Shadow proxy";
/** Merged depth geometry per primitive set; the source geometries are shared by every clone. */
const merged = new WeakMap<BufferGeometry, BufferGeometry | null>();

function depthGeometry(meshes: readonly SkinnedMesh[]): BufferGeometry | null {
  const first = meshes[0]!.geometry;
  if (merged.has(first)) return merged.get(first)!;
  const pieces = meshes.map((m) => {
    const g = new BufferGeometry();
    for (const name of DEPTH_ATTRIBUTES) g.setAttribute(name, m.geometry.getAttribute(name));
    g.setIndex(m.geometry.index);
    return g;
  });
  // mergeGeometries rejects mismatched index / attribute array types; that rig keeps per-primitive shadows.
  const result = pieces.every((g) => !!g.index === !!pieces[0]!.index) ? mergeGeometries(pieces) : null;
  merged.set(first, result);
  return result;
}

/** Adds one proxy per group of sibling primitives sharing a Skeleton and bind pose, and stops those
 * primitives casting. Returns the proxies; primitives the proxy can't cover keep their own shadows. */
export function attachShadowProxies(root: Object3D): SkinnedMesh[] {
  const groups = new Map<Object3D, SkinnedMesh[]>();
  root.traverse((o) => {
    const mesh = o as SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.castShadow || !mesh.parent || Object.keys(mesh.geometry.morphAttributes).length) return;
    if (DEPTH_ATTRIBUTES.some((name) => !mesh.geometry.getAttribute(name))) return;
    const list = groups.get(mesh.parent) ?? [];
    list.push(mesh);
    groups.set(mesh.parent, list);
  });
  const proxies: SkinnedMesh[] = [];
  for (const [parent, all] of groups) {
    const first = all[0]!;
    const meshes = all.filter((m) => m.skeleton === first.skeleton && m.bindMode === first.bindMode && m.bindMatrix.equals(first.bindMatrix) && m.matrix.equals(first.matrix));
    if (meshes.length < 2) continue;
    const geometry = depthGeometry(meshes);
    if (!geometry) continue;
    const proxy = new SkinnedMesh(geometry, material);
    proxy.name = "Shadow proxy";
    proxy.userData.shadowProxy = true;
    proxy.position.copy(first.position); proxy.quaternion.copy(first.quaternion); proxy.scale.copy(first.scale);
    proxy.bindMode = first.bindMode;
    proxy.bind(first.skeleton, first.bindMatrix);
    proxy.castShadow = true;
    proxy.customDepthMaterial = skinnedCasterDepth;
    proxy.receiveShadow = false;
    proxy.frustumCulled = first.frustumCulled;
    proxy.visible = false;
    parent.add(proxy);
    for (const m of meshes) m.castShadow = false;
    proxies.push(proxy);
  }
  return proxies;
}
