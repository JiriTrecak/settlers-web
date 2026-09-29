/** One-frame draw census for the profiler: wraps every renderable's render/shadow hooks for a
 * single `draw()` call and attributes draw calls and triangles to the scene branch they belong
 * to. Hooks are restored immediately after, so nothing persists outside the requested frame. */
import type { BufferGeometry, Object3D, Scene } from "three";

export type CensusRow = { branch: string; mainDraws: number; shadowDraws: number; mainTriangles: number; shadowTriangles: number; objects: number; visible: number; height?: number };
/** Scene-graph cost per top-level branch: every node is visited by updateMatrixWorld each
 * frame, and `composed` ones (matrixAutoUpdate) also rebuild their local matrix. */
export type GraphRow = { branch: string; nodes: number; composed: number; bones: number };
export type DrawCensus = { rows: CensusRow[]; graph: GraphRow[]; objects: number; visible: number; renderables: number };

type Renderable = Object3D & { geometry: BufferGeometry; count?: number; isInstancedMesh?: boolean };
const label = (o: Object3D) => o.name || o.type;

/** The top-level branch plus up to two more named levels, e.g. `props/casters/prop woodland-pine-a`.
 * Spatial cell groups (`props 3,1`) are folded away so rows aggregate per asset. */
function branchOf(o: Object3D, scene: Scene): string {
  const chain: Object3D[] = [];
  for (let n: Object3D | null = o; n && n !== scene; n = n.parent) chain.push(n);
  chain.reverse();
  if (!chain.length) return label(o);
  const named = chain.slice(1).filter((n) => n.name && !/[ :]-?\d+,-?\d+$/.test(n.name)).slice(0, 2);
  return [chain[0]!, ...named].map(label).join("/");
}

function triangles(o: Renderable): number {
  const g = o.geometry, drawn = g.index ? g.index.count : (g.attributes.position?.count ?? 0);
  const ranged = Math.min(drawn, Number.isFinite(g.drawRange.count) ? g.drawRange.count : drawn);
  return (ranged / 3) * (o.isInstancedMesh ? (o.count ?? 1) : 1);
}

/** Largest axis scale of the first instance: batches share one prototype geometry. */
function instanceScale(o: Renderable & { instanceMatrix?: { array: ArrayLike<number> } }): number {
  const m = o.isInstancedMesh ? o.instanceMatrix?.array : undefined;
  if (!m) return 1;
  return Math.sqrt(Math.max(m[0]! ** 2 + m[1]! ** 2 + m[2]! ** 2, m[4]! ** 2 + m[5]! ** 2 + m[6]! ** 2, m[8]! ** 2 + m[9]! ** 2 + m[10]! ** 2));
}

export function drawCensus(scene: Scene, draw: () => void): DrawCensus {
  const rows = new Map<string, CensusRow>(), graph = new Map<string, GraphRow>(), restore: (() => void)[] = [];
  let objects = 0, visible = 0, renderables = 0;
  scene.traverse((o) => {
    objects++;
    let top: Object3D = o;
    while (top.parent && top.parent !== scene) top = top.parent;
    const key = top === scene ? "scene" : label(top);
    let g = graph.get(key);
    if (!g) graph.set(key, (g = { branch: key, nodes: 0, composed: 0, bones: 0 }));
    g.nodes++;
    if (o.matrixAutoUpdate) g.composed++;
    if ((o as Object3D & { isBone?: boolean }).isBone) g.bones++;
    let shown = o.visible;
    for (let p = o.parent; shown && p; p = p.parent) shown = p.visible;
    if (shown) visible++;
    const r = o as Renderable;
    if (!r.geometry) return;
    renderables++;
    const branch = branchOf(o, scene);
    let row = rows.get(branch);
    if (!row) rows.set(branch, (row = { branch, mainDraws: 0, shadowDraws: 0, mainTriangles: 0, shadowTriangles: 0, objects: 0, visible: 0 }));
    row.objects++;
    if (shown) row.visible++;
    r.geometry.boundingBox ?? r.geometry.computeBoundingBox();
    const box = r.geometry.boundingBox!, scale = o.matrixWorld.getMaxScaleOnAxis() * instanceScale(r);
    row.height = Math.max(row.height ?? 0, (box.max.y - box.min.y) * scale);
    const after = o.onAfterRender, shadow = o.onAfterShadow, target = row;
    const ownAfter = Object.hasOwn(o, "onAfterRender"), ownShadow = Object.hasOwn(o, "onAfterShadow");
    o.onAfterRender = function (...args) { target.mainDraws++; target.mainTriangles += triangles(r); after.apply(this, args); };
    o.onAfterShadow = function (...args) { target.shadowDraws++; target.shadowTriangles += triangles(r); shadow.apply(this, args); };
    // Inherited no-op hooks are deleted rather than re-assigned, leaving objects exactly as found.
    restore.push(() => {
      if (ownAfter) o.onAfterRender = after; else delete (o as Partial<Object3D>).onAfterRender;
      if (ownShadow) o.onAfterShadow = shadow; else delete (o as Partial<Object3D>).onAfterShadow;
    });
  });
  try { draw(); } finally { for (const undo of restore) undo(); }
  return { rows: [...rows.values()].sort((a, b) => b.mainDraws + b.shadowDraws - a.mainDraws - a.shadowDraws), graph: [...graph.values()].sort((a, b) => b.nodes - a.nodes), objects, visible, renderables };
}
