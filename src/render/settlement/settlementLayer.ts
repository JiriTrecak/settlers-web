import { TerritoryPosts } from "./territoryPosts";
import { prepareAntMaterial } from '../prop/antMaterials';
import {
  Group,
  Object3D,
  Mesh,
  MeshStandardMaterial,
  BoxGeometry,
  RingGeometry,
  MeshBasicMaterial,
  Vector3,
  type Scene,
  type Raycaster,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { BUILDINGS, type BuildingKind } from "../../shared/settlement/rules";
import { PLAYER_COLORS, type HeightField } from "../../shared";
import type { SettlementView } from "../../sim/settlement/settlement";
import { stockpileLayout } from "../../shared/settlement/stockpile";
import type { ItemKind, ItemStock } from "../../shared/settlement/rules";
const urls = {
  fort: new URL("../../../assets/ant-colony/fort.glb", import.meta.url)
    .href,
  sawmill: new URL(
    "../../../assets/ant-colony/sawmill.glb",
    import.meta.url,
  ).href,
  forester: new URL(
    "../../../assets/ant-colony/forester.glb",
    import.meta.url,
  ).href,
  "item-log": new URL(
    "../../../assets/ant-colony/item-log.glb",
    import.meta.url,
  ).href,
  "item-plank": new URL(
    "../../../assets/ant-colony/item-plank.glb",
    import.meta.url,
  ).href,
  "item-stone": new URL(
    "../../../assets/ant-colony/item-stone.glb",
    import.meta.url,
  ).href,
  tower: new URL("../../../assets/props/settlement/tower.glb", import.meta.url)
    .href,
  lumberjack: new URL(
    "../../../assets/ant-colony/lumberjack.glb",
    import.meta.url,
  ).href,
  stonemason: new URL(
    "../../../assets/props/settlement/stonemason.glb",
    import.meta.url,
  ).href,
  house: new URL("../../../assets/props/settlement/house.glb", import.meta.url)
    .href,
  settler: new URL(
    "../../../assets/ant-colony/worker.glb",
    import.meta.url,
  ).href,
};
export class SettlementLayer {
  private readonly root = new Group();
  private readonly prototypes = new Map<string, Object3D>();
  private readonly entities = new Map<number, Object3D>();
  private readonly borders = new TerritoryPosts();
  private readonly ghost = new Mesh(
    new BoxGeometry(5, 0.15, 5),
    new MeshStandardMaterial({
      color: 0x68d893,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    }),
  );
  private readonly selection = new Mesh(
    new RingGeometry(0.82, 1, 40),
    new MeshBasicMaterial({
      color: 0xffed9d,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }),
  );
  private selected: number | null = null;
  select(id: number | null) {
    this.selected = id;
  }
  pick(ray: Raycaster, maxDistance = Infinity): number | null {
    const hit = ray
      .intersectObjects([...this.entities.values()], true)
      .find((h) => h.distance <= maxDistance);
    let object: Object3D | null = hit?.object ?? null;
    while (object) {
      if (typeof object.userData.entityId === "number")
        return object.userData.entityId;
      object = object.parent;
    }
    return null;
  }
  private revision = -1;
  private dead = false;
  readonly ready: Promise<void>;
  constructor(scene: Scene) {
    this.root.name = "settlement";
    this.root.add(this.borders, this.ghost, this.selection);
    this.ghost.visible = false;
    this.selection.rotation.x = -Math.PI / 2;
    this.selection.visible = false;
    scene.add(this.root);
    const loader = new GLTFLoader();
    this.ready = Promise.all(
      Object.entries(urls).map(async ([id, url]) => {
        const gltf = await loader.loadAsync(url);
        if (!this.dead) this.prototypes.set(id, gltf.scene);
      }),
    ).then(() => {});
  }
  private make(id: number, kind: string, owner: number) {
    let o = this.entities.get(id);
    if (o) return o;
    const p = this.prototypes.get(kind);
    if (!p) return null;
    o = p.clone(true);
    o.userData.entityId = id;
    o.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];
        const copies = materials.map((mat) => {
          const m = mat.clone();
          if(m instanceof MeshStandardMaterial)prepareAntMaterial(m);
          if (m instanceof MeshStandardMaterial && (m.name === "UTC Team color" || m.name === "Ant faction red"))
            m.color.set(PLAYER_COLORS[owner % PLAYER_COLORS.length]!);
          return m;
        });
        child.material = Array.isArray(child.material) ? copies : copies[0]!;
      }
    });
    if (kind === "settler") {
      const cargo = new Group();
      cargo.name = "Cargo";
      cargo.position.set(0, 0.95, 0.45);
      cargo.visible = false;
      o.add(cargo);
      for (const kind of ["log", "plank", "stone"] as const) {
        const item = this.item(kind);
        if (item) {
          item.name = kind;
          item.scale.setScalar(0.7);
          cargo.add(item);
        }
      }
    }
    this.entities.set(id, o);
    this.root.add(o);
    return o;
  }
  update(state: SettlementView, field: HeightField, tick: number) {
    if (state.revision !== this.revision) {
      this.revision = state.revision;
      this.borderGeometry(state, field);
    }
    const selected =
      state.buildings.find((b) => b.id === this.selected) ??
      state.workers.find((w) => w.id === this.selected);
    this.selection.visible = !!selected;
    if (selected) {
      this.selection.position.set(
        selected.x,
        field.sample(selected.x, selected.z) + 0.12,
        selected.z,
      );
      this.selection.scale.setScalar(
        "kind" in selected ? BUILDINGS[selected.kind].radius + 1 : 1,
      );
    }
    const seen = new Set<number>();
    for (const b of state.buildings) {
      seen.add(b.id);
      const o = this.make(b.id, b.kind, b.owner);
      if (!o) continue;
      o.visible = b.health > 0;
      o.position.set(b.x, field.sample(b.x, b.z), b.z);
      const colony = state.colonies.find((c) => c.owner === b.owner);
      const inventory: ItemStock = !b.complete
        ? { log: 0, plank: b.delivered.wood, stone: b.delivered.stone }
        : b.kind === "fort"
          ? {
              log: 0,
              plank: colony?.stock.wood ?? 0,
              stone: colony?.stock.stone ?? 0,
            }
          : b.inventory;
      this.stockpile(o, inventory, BUILDINGS[b.kind].radius, field, b.x, b.z);
      o.scale.y = b.complete
        ? 1
        : 0.12 + (0.88 * b.progress) / BUILDINGS[b.kind].work;
      o.getObjectByName("Stockpile")?.scale.set(1, 1 / o.scale.y, 1);
    }
    for (const w of state.workers) {
      seen.add(w.id);
      const o = this.make(w.id, "settler", w.owner);
      if (!o) continue;
      const target = new Vector3(w.x, field.sample(w.x, w.z), w.z);
      if (o.userData.placed) {
        const dx = target.x - o.position.x,
          dz = target.z - o.position.z;
        if (Math.abs(dx) + Math.abs(dz) > 0.03)
          o.rotation.y = Math.atan2(dx, dz);
        o.position.lerp(target, 0.35);
      } else {
        o.position.copy(target);
        o.userData.placed = true;
      }
      const cargo = o.getObjectByName("Cargo");
      if (cargo) {
        cargo.visible = w.quantity > 0;
        const kind = w.shipment?.item ?? (
          w.carry === "stone"
            ? "stone"
            : w.role === "lumberjack" ||
                (w.role === "sawyer" && w.job === "mill-input")
              ? "log"
              : "plank");
        for (const item of cargo.children) item.visible = item.name === kind;
      }
      o.traverse((child) => {
        if (child.name.startsWith("Leg") || child.name.startsWith("Arm"))
          child.rotation.x =
            w.job === "idle" || w.job === "gather" || w.job === "build"
              ? 0
              : Math.sin(tick * 0.3) *
                (child.name.includes("L") ? 1 : -1) *
                0.5;
      });
    }
    for (const [id, o] of this.entities)
      if (!seen.has(id)) {
        this.disposeInstance(o);
        this.root.remove(o);
        this.entities.delete(id);
      }
  }
  private item(kind: ItemKind) {
    const p = this.prototypes.get("item-" + kind);
    if (!p) return null;
    const o = p.clone(true);
    o.userData.sharedItem = true;
    o.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.userData.sharedItem = true;
      }
    });
    return o;
  }
  private stockpile(
    o: Object3D,
    stock: ItemStock,
    radius: number,
    field: HeightField,
    x: number,
    z: number,
  ) {
    const key = JSON.stringify(stock);
    if (o.userData.stockKey === key) return;
    o.getObjectByName("Stockpile")?.removeFromParent();
    const group = new Group();
    group.name = "Stockpile";
    for (const slot of stockpileLayout(stock, radius)) {
      const item = this.item(slot.kind);
      if (!item) return;
      item.position.set(
        slot.x,
        field.sample(x + slot.x, z + slot.z) -
          field.sample(x, z) +
          0.02 +
          slot.y,
        slot.z,
      );
      group.add(item);
    }
    o.add(group);
    o.userData.stockKey = key;
  }
  preview(
    kind: BuildingKind | null,
    x: number,
    z: number,
    allowed: boolean,
    field: HeightField,
  ) {
    this.ghost.visible = kind !== null;
    if (!kind) return;
    this.ghost.scale.set(
      (BUILDINGS[kind].radius * 2 + 1) / 5,
      1,
      (BUILDINGS[kind].radius * 2 + 1) / 5,
    );
    this.ghost.position.set(x, field.sample(x, z) + 0.15, z);
    this.ghost.material.color.set(allowed ? 0x68d893 : 0xf26960);
  }
  private borderGeometry(state: SettlementView, field: HeightField) {
    this.borders.rebuild(state.territory, field);
  }
  private disposeInstance(o: Object3D) {
    o.traverse((child) => {
      if (child instanceof Mesh && !child.userData.sharedItem) {
        if (child.name === "Cargo") child.geometry.dispose();
        for (const m of Array.isArray(child.material)
          ? child.material
          : [child.material])
          m.dispose();
      }
    });
  }
  destroy(scene: Scene) {
    this.dead = true;
    for (const o of this.entities.values()) this.disposeInstance(o);
    for (const p of this.prototypes.values())
      p.traverse((o) => {
        if (o instanceof Mesh) {
          o.geometry.dispose();
          for (const m of Array.isArray(o.material) ? o.material : [o.material])
            m.dispose();
        }
      });
    this.borders.dispose();
    this.ghost.geometry.dispose();
    this.ghost.material.dispose();
    this.selection.geometry.dispose();
    this.selection.material.dispose();
    scene.remove(this.root);
  }
}
