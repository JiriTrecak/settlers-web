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
  private height: ((x: number, z: number) => number) | null = null;
  private gen = 0;

  constructor(
    private readonly scene: Scene,
    private urls: ReadonlyMap<string, string>,
  ) {}

  setUrls(urls: ReadonlyMap<string, string>): void {
    this.urls = urls;
  }

  setHeight(sample: ((x: number, z: number) => number) | null): void {
    this.height = sample;
    for (const mesh of this.placed.values()) {
      mesh.position.y = sample ? sample(mesh.position.x, mesh.position.z) : 0;
    }
  }

  sync(stamps: readonly MapStamp[]): void {
    const gen = ++this.gen;
    const seen = new Set<string>();
    for (const stamp of stamps) {
      seen.add(stamp.id);
      const existing = this.placed.get(stamp.id);
      if (existing) {
        this.place(existing, stamp);
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
    this.place(mesh, stamp);
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

  private place(mesh: Object3D, stamp: MapStamp): void {
    const s = stamp.scale ?? 1;
    const x = stamp.x + 0.5;
    const z = stamp.y + 0.5;
    const y = this.height ? this.height(x, z) : 0;
    mesh.position.set(x, y, z);
    mesh.rotation.y = stamp.yaw ?? 0;
    mesh.scale.setScalar(s);
  }
}
