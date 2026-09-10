import { Group, Mesh, type Object3D } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { content } from '../../content/builtin';
import { projectMeshUrl } from '../../shared/assets/project';
import type { EntityView } from '../../sim/game/observation';
import type { HeightField } from '../../shared/map/height';
import { prepareAntMaterials } from '../prop/antMaterials';
import { TreePlayer } from '../prop/treePlayer';

/** Standing forest stays instanced. Only damaged/falling trees acquire two-mesh proxies. */
export class HarvestTrees {
  private readonly sources = new Map<string, GLTF>();
  private readonly active = new Map<number, {root: Object3D; player: TreePlayer; file: string}>();
  private dead = false;
  readonly ready: Promise<void>;
  constructor(private readonly parent: Group) {
    const loader = new GLTFLoader();
    const files = new Set(content.assets.flatMap(a => a.harvestAnimation ? [a.harvestAnimation] : []));
    this.ready = Promise.all([...files].map(async file => {
      const url = projectMeshUrl(file);
      if (!url) throw new Error(`Missing tree animation ${file}`);
      const gltf = await loader.loadAsync(url);
      if (this.dead) { this.disposeSource(gltf); return; }
      prepareAntMaterials(gltf.scene);
      gltf.scene.traverse(o => { if (o instanceof Mesh) o.castShadow = o.receiveShadow = true; });
      this.sources.set(file, gltf);
    })).then(() => {});
  }
  update(entities: readonly EntityView[], field: HeightField, tick: number) {
    const seen = new Set<number>();
    for (const e of entities) {
      const f = e.resource?.felling, d = content.get(e.definition);
      if (!f || f.lastHitTick === null || !d.felling) continue;
      if (f.fallTick !== null && tick >= f.fallTick + d.felling.fallTicks + d.felling.decayTicks) continue;
      const asset = content.asset(e.appearance?.asset ?? d.asset), file = asset.harvestAnimation;
      const source = file && this.sources.get(file);
      if (!file || !source) continue;
      seen.add(e.id);
      let entry = this.active.get(e.id);
      if (entry && entry.file !== file) { this.remove(e.id); entry = undefined; }
      if (!entry) {
        const root = new Group(), model = source.scene.clone(true);
        root.name = `harvest-tree-${e.id}`;
        root.add(model); this.parent.add(root);
        entry = {root, player: new TreePlayer(model, source.animations), file};
        this.active.set(e.id, entry);
      }
      entry.root.userData.entityId = e.id;
      entry.root.userData.harvestable = f.hp > 0;
      entry.root.position.set(e.x, field.sample(e.x, e.y), e.y);
      entry.root.scale.setScalar(e.appearance?.scale ?? 1);
      entry.root.rotation.y = f.fallTick === null ? e.rotation * Math.PI / 180 : Math.atan2(f.direction.x, f.direction.y);
      entry.player.sample(f, tick, d.felling.fallTicks, d.felling.decayTicks);
    }
    for (const id of this.active.keys()) if (!seen.has(id)) this.remove(id);
  }
  pickableRoots(): Object3D[] {
    return [...this.active.values()].filter(e => e.root.userData.harvestable).map(e => e.root);
  }
  private remove(id: number) {
    const entry = this.active.get(id)!;
    entry.player.dispose(); entry.root.removeFromParent(); this.active.delete(id);
  }
  private disposeSource(gltf: GLTF) {
    // Shared geometry and materials live until the whole layer is disposed.
    const geometries = new Set<Mesh['geometry']>();
    const mats = new Set<import('three').Material>();
    gltf.scene.traverse(o => {
      if (!(o instanceof Mesh)) return;
      geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.add(m);
    });
    geometries.forEach(g => g.dispose()); mats.forEach(m => m.dispose());
  }
  dispose() {
    this.dead = true;
    for (const id of this.active.keys()) this.remove(id);
    this.sources.forEach(s => this.disposeSource(s)); this.sources.clear();
  }
}
