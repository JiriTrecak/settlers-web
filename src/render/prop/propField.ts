/**
 * Stamp meshes in the scene. Loads each catalog glTF once, clones per placement.
 * Water-type assets sit on the sea plane, not the lakebed.
 */
import { BoxHelper, Object3D, type Raycaster, type Scene } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { MapStamp } from "../../shared";
import { flattenPolygon } from "./polygonLook";

export class PropField {
  private readonly loader = new GLTFLoader();
  private readonly protos = new Map<string, Promise<Object3D | null>>();
  private readonly placed = new Map<string, Object3D>();
  private height: ((x: number, z: number) => number) | null = null;
  private float = new Set<string>();
  private waterY = 0;
  private gen = 0;
  private picked: string | null = null;
  private mark: BoxHelper | null = null;

  constructor(
    private readonly scene: Scene,
    private urls: ReadonlyMap<string, string>,
  ) {}

  setUrls(urls: ReadonlyMap<string, string>): void {
    this.urls = urls;
  }

  setHeight(sample: ((x: number, z: number) => number) | null): void {
    this.height = sample;
    this.relift();
  }

  setFloat(ids: ReadonlySet<string>, y = 0): void {
    this.float = new Set(ids);
    this.waterY = y;
    this.relift();
  }

  setWaterY(y: number): void {
    this.waterY = y;
    this.relift();
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
    this.syncMark();
  }

  setSelected(id: string | null): void {
    this.picked = id;
    this.syncMark();
  }

  pick(ray: Raycaster): string | null {
    const hits = ray.intersectObjects([...this.placed.values()], true);
    for (const hit of hits) {
      let n: Object3D | null = hit.object;
      while (n) {
        if (typeof n.userData.stamp === "string") return n.userData.stamp;
        n = n.parent;
      }
    }
    return null;
  }

  destroy(): void {
    this.gen++;
    for (const mesh of this.placed.values()) this.scene.remove(mesh);
    this.placed.clear();
    if (this.mark) {
      this.scene.remove(this.mark);
      this.mark.geometry.dispose();
      this.mark = null;
    }
  }

  private async spawn(stamp: MapStamp, gen: number): Promise<void> {
    const proto = await this.proto(stamp.asset);
    if (gen !== this.gen || !proto || this.placed.has(stamp.id)) return;
    const mesh = proto.clone();
    this.place(mesh, stamp);
    this.scene.add(mesh);
    this.placed.set(stamp.id, mesh);
    if (stamp.id === this.picked) this.syncMark();
  }

  private proto(asset: string): Promise<Object3D | null> {
    const key = `${asset}#unity7`;
    const hit = this.protos.get(key);
    if (hit) return hit;
    const url = this.urls.get(asset);
    const pending = url ? this.load(url, asset) : Promise.resolve(null);
    this.protos.set(key, pending);
    return pending;
  }

  private async load(url: string, asset: string): Promise<Object3D | null> {
    try {
      const gltf = await this.loader.loadAsync(url);
      if (url.includes("synty") || asset.startsWith("synty-")) flattenPolygon(gltf.scene, asset);
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
    mesh.userData.asset = stamp.asset;
    mesh.userData.stamp = stamp.id;
    mesh.position.set(x, this.sitY(stamp.asset, x, z), z);
    mesh.rotation.y = stamp.yaw ?? 0;
    mesh.scale.setScalar(s);
  }

  private sitY(asset: string, x: number, z: number): number {
    if (this.float.has(asset)) return this.waterY;
    return this.height ? this.height(x, z) : 0;
  }

  private relift(): void {
    for (const mesh of this.placed.values()) {
      const asset = typeof mesh.userData.asset === "string" ? mesh.userData.asset : "";
      mesh.position.y = this.sitY(asset, mesh.position.x, mesh.position.z);
    }
    this.syncMark();
  }

  private syncMark(): void {
    const mesh = this.picked ? this.placed.get(this.picked) : undefined;
    if (!mesh) {
      if (this.mark) this.mark.visible = false;
      return;
    }
    if (this.mark && this.mark.userData.stamp === this.picked) {
      this.mark.update();
      this.mark.visible = true;
      return;
    }
    if (this.mark) {
      this.scene.remove(this.mark);
      this.mark.geometry.dispose();
    }
    const mark = new BoxHelper(mesh, 0xe8e0d0);
    mark.userData.stamp = this.picked;
    this.scene.add(mark);
    this.mark = mark;
  }
}
