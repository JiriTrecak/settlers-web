/**
 * Stamp meshes in the scene. Loads each catalog glTF once, clones per placement.
 */
import { Object3D, type Scene } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { MapStamp } from "../../shared";

export class PropField {
  private readonly loader = new GLTFLoader();
  private readonly protos = new Map<string, Promise<Object3D | null>>();
  private readonly placed = new Map<string, Object3D>();
  private gen = 0;

  constructor(
    private readonly scene: Scene,
    private readonly urls: ReadonlyMap<string, string>,
  ) {}

  sync(stamps: readonly MapStamp[]): void {
    const gen = ++this.gen;
    const seen = new Set<string>();
    for (const stamp of stamps) {
      seen.add(stamp.id);
      const existing = this.placed.get(stamp.id);
      if (existing) {
        existing.position.set(stamp.x + 0.5, 0, stamp.y + 0.5);
        continue;
      }
      void this.spawn(stamp, gen);
    }
    for (const [id, mesh] of this.placed) {
      if (seen.has(id)) continue;
      this.scene.remove(mesh);
      this.placed.delete(id);
    }
  }

  destroy(): void {
    this.gen++;
    for (const mesh of this.placed.values()) this.scene.remove(mesh);
    this.placed.clear();
  }

  private async spawn(stamp: MapStamp, gen: number): Promise<void> {
    const proto = await this.proto(stamp.asset);
    if (gen !== this.gen || !proto || this.placed.has(stamp.id)) return;
    const mesh = proto.clone();
    mesh.position.set(stamp.x + 0.5, 0, stamp.y + 0.5);
    this.scene.add(mesh);
    this.placed.set(stamp.id, mesh);
  }

  private proto(asset: string): Promise<Object3D | null> {
    const hit = this.protos.get(asset);
    if (hit) return hit;
    const url = this.urls.get(asset);
    const pending = url ? this.load(url) : Promise.resolve(null);
    this.protos.set(asset, pending);
    return pending;
  }

  private async load(url: string): Promise<Object3D | null> {
    try {
      const gltf = await this.loader.loadAsync(url);
      gltf.scene.traverse((node) => {
        node.castShadow = true;
        node.receiveShadow = true;
      });
      return gltf.scene;
    } catch {
      return null;
    }
  }
}
