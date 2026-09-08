import {
  Group,
  Object3D,
  Mesh,
  MeshStandardMaterial,
  BoxGeometry,
  RingGeometry,
  MeshBasicMaterial,
  Sprite,
  SpriteMaterial,
  Vector3,
  CylinderGeometry,
  type Scene,
  type Raycaster,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { content } from "../../content/builtin";
import { ownerSlot } from "../../content/schema";
import { projectMeshUrl } from "../../shared/assets/project";
import { stockpileLayout } from "../../shared/settlement/stockpile";
import type { HeightField } from "../../shared/map/height";
import type { EntityView, SettlementView } from "../../sim/game/observation";
import { applyPlayerMaterials } from "./playerMaterials";
import { prepareAntMaterial } from "../prop/antMaterials";
import { TerritoryPosts } from "./territoryPosts";

/** One scene adapter for observed entities. Models and pose variants come from asset declarations. */
export class SettlementLayer {
  private readonly root = new Group();
  private readonly prototypes = new Map<string, Object3D>();
  private readonly entities = new Map<number, Object3D>();
  private selected = new Set<number>();
  private readonly arrows: {
    mesh: Mesh;
    start: Vector3;
    end: Vector3;
    tick: number;
  }[] = [];
  private readonly arrowGeometry = new CylinderGeometry(0.035, 0.035, 0.9, 5);
  private readonly arrowMaterial = new MeshStandardMaterial({
    color: 0xc3a779,
    roughness: 0.8,
  });
  private readonly borders = new TerritoryPosts();
  private revision = -1;
  private dead = false;
  private readonly ringGeometry = new RingGeometry(0.82, 1, 32);
  private readonly ringMaterial = new MeshBasicMaterial({
    color: 0xffed9d,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  private readonly hpBack = new SpriteMaterial({
    color: 0x17201c,
    depthTest: false,
  });
  private readonly hpFill = new SpriteMaterial({
    color: 0x73d45d,
    depthTest: false,
  });
  private readonly ghost = new Mesh(
    new BoxGeometry(1, 0.15, 1),
    new MeshStandardMaterial({
      color: 0x68d893,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    }),
  );
  readonly ready: Promise<void>;
  constructor(scene: Scene) {
    this.root.name = "game-entities";
    this.root.add(this.borders, this.ghost);
    this.ghost.visible = false;
    scene.add(this.root);
    const loader = new GLTFLoader();
    this.ready = Promise.all(
      content.assets
        .filter((a) => a.file && !a.sceneryAsset)
        .map(async (a) => {
          const url = projectMeshUrl(a.file!);
          if (!url) throw new Error(`Missing declared model ${a.file}`);
          const gltf = await loader.loadAsync(url);
          if (!this.dead) this.prototypes.set(a.id, gltf.scene);
        }),
    ).then(() => {});
  }
  select(ids: number | null | readonly number[]) {
    this.selected = new Set(
      ids === null ? [] : typeof ids === "number" ? [ids] : ids,
    );
  }
  pick(ray: Raycaster, maxDistance = Infinity) {
    const hit = ray
      .intersectObjects(
        [...this.entities.values()].filter((o) => o.visible),
        true,
      )
      .find((h) => h.distance <= maxDistance);
    let node: Object3D | null = hit?.object ?? null;
    while (node) {
      if (typeof node.userData.entityId === "number")
        return node.userData.entityId;
      node = node.parent;
    }
    return null;
  }
  private clone(asset: string) {
    const proto = this.prototypes.get(asset);
    if (!proto) return null;
    const o = proto.clone(true);
    o.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        const mats = (
          Array.isArray(child.material) ? child.material : [child.material]
        ).map((m) => {
          const copy = m.clone();
          if (copy instanceof MeshStandardMaterial) prepareAntMaterial(copy);
          return copy;
        });
        child.material = Array.isArray(child.material) ? mats : mats[0];
      }
    });
    return o;
  }
  private make(e: EntityView) {
    const d = content.get(e.definition),
      assetId = e.appearance?.asset ?? d.asset;
    let o = this.entities.get(e.id);
    if (o && o.userData.asset !== assetId) {
      this.disposeInstance(o);
      o.removeFromParent();
      this.entities.delete(e.id);
      o = undefined;
    }
    if (o) return o;
    const model = this.clone(assetId);
    if (!model) return null;
    o = new Group();
    model.name = "Body";
    o.add(model);
    o.userData.asset = assetId;
    o.userData.entityId = e.id;
    const asset = content.asset(assetId),
      scale = (asset.scale ?? 1) * (e.appearance?.scale ?? 1);
    o.userData.modelScale = scale;
    model.scale.setScalar(scale);
    if (asset.carryAsset) {
      const carry = this.clone(asset.carryAsset);
      if (carry) {
        carry.name = "CarryBody";
        carry.scale.setScalar(scale);
        carry.visible = false;
        o.add(carry);
      }
    }
    const cargo = new Group();
    cargo.name = "Cargo";
    cargo.position.set(0, 1.04, 0.48);
    o.add(cargo);
    const stock = new Group();
    stock.name = "Stockpile";
    o.add(stock);
    const ring = new Mesh(this.ringGeometry, this.ringMaterial);
    ring.name = "Selection";
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.12;
    ring.scale.setScalar(
      d.footprint ? Math.max(d.footprint.width, d.footprint.depth) / 2 + 1 : 1,
    );
    ring.visible = false;
    o.add(ring);
    const hp = new Group();
    hp.name = "Health";
    hp.position.set(-0.6, asset.healthHeight ?? 2.5, 0);
    const back = new Sprite(this.hpBack),
      fill = new Sprite(this.hpFill);
    back.center.set(0, 0.5);
    fill.center.set(0, 0.5);
    back.scale.set(1.2, 0.13, 1);
    fill.scale.set(1.16, 0.09, 1);
    fill.position.set(0.02, 0.005, 0.01);
    back.renderOrder = 20;
    fill.renderOrder = 21;
    hp.add(back, fill);
    o.add(hp);
    this.entities.set(e.id, o);
    this.root.add(o);
    return o;
  }
  update(state: SettlementView, field: HeightField, tick: number) {
    if (state.revision !== this.revision) {
      this.revision = state.revision;
      this.borders.rebuild(state.territory, field, state.territoryBorders);
    }
    const seen = new Set<number>();
    for (const e of state.entities) {
      const d = content.get(e.definition);
      if (d.kind === "resource") continue;
      seen.add(e.id);
      const o = this.make(e);
      if (!o) continue;
      o.visible = !e.unit?.contained;
      applyPlayerMaterials(o, ownerSlot(e.owner));
      const target = new Vector3(e.x, field.sample(e.x, e.y), e.y);
      if (e.unit && o.userData.placed) {
        const delta = target.clone().sub(o.position);
        if (delta.lengthSq() > 0.005)
          o.rotation.y = Math.atan2(delta.x, delta.z);
        o.position.lerp(target, 0.35);
      } else {
        o.position.copy(target);
        o.rotation.y = (e.rotation * Math.PI) / 180;
        o.userData.placed = true;
      }
      const carry = o.getObjectByName("CarryBody"),
        body = o.getObjectByName("Body")!;
      if (carry) {
        carry.visible = !!e.unit?.cargo;
        body.visible = !carry.visible;
      }
      const buildProgress = e.construction
        ? Math.max(0.1, e.construction.progress / d.creation!.workTicks)
        : 1;
      body.scale.y = buildProgress * (o.userData.modelScale ?? 1);
      if (e.item) body.visible = false;
      o.getObjectByName("Selection")!.visible = this.selected.has(e.id);
      const hp = o.getObjectByName("Health")!;
      hp.visible =
        !!d.body && (this.selected.has(e.id) || e.hp! < d.body.maxHp);
      if (d.body)
        hp.children[1].scale.x = 1.16 * Math.max(0, e.hp! / d.body.maxHp);
      const cargo = o.getObjectByName("Cargo")!;
      const cargoKey = e.unit?.cargo?.item ?? "";
      if (o.userData.cargoKey !== cargoKey) {
        for (const child of [...cargo.children]) {
          this.disposeInstance(child);
          child.removeFromParent();
        }
        if (cargoKey) {
          const item = this.clone(content.get(cargoKey).asset);
          if (item) {
            item.scale.setScalar(0.7);
            cargo.add(item);
          }
        }
        o.userData.cargoKey = cargoKey;
      }
      const stock = e.item
          ? { [e.definition]: e.item.quantity }
          : (e.inventory ?? {}),
        stockKey = JSON.stringify(stock);
      if (o.userData.stockKey !== stockKey) {
        const group = o.getObjectByName("Stockpile")!;
        for (const child of [...group.children]) {
          this.disposeInstance(child);
          child.removeFromParent();
        }
        for (const slot of stockpileLayout(
          stock,
          e.item ? -0.15 : (d.footprint?.depth ?? 2) / 2,
        )) {
          const item = this.clone(content.get(slot.kind).asset);
          if (item) {
            item.position.set(slot.x, slot.y + 0.02, slot.z);
            group.add(item);
          }
        }
        o.userData.stockKey = stockKey;
      }
      if (e.unit && content.asset(e.appearance?.asset ?? d.asset).projectile) {
        if (
          e.unit.target !== null &&
          e.unit.cooldown > (o.userData.cooldown ?? e.unit.cooldown)
        ) {
          const target = state.entities.find((t) => t.id === e.unit!.target);
          if (target) {
            const mesh = new Mesh(this.arrowGeometry, this.arrowMaterial);
            mesh.castShadow = false;
            this.root.add(mesh);
            this.arrows.push({
              mesh,
              start: o.position.clone().add(new Vector3(0, 1.5, 0)),
              end: new Vector3(
                target.x,
                field.sample(target.x, target.y) + 1,
                target.y,
              ),
              tick,
            });
          }
        }
        o.userData.cooldown = e.unit.cooldown;
      }
      if (e.unit)
        o.traverse((child) => {
          if (child.name.startsWith("Leg") || child.name.startsWith("Arm"))
            child.rotation.x = e.unit!.moving
              ? Math.sin(tick * 0.3) * (child.name.includes("L") ? 1 : -1) * 0.5
              : 0;
        });
    }
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i],
        t = (tick - a.tick) / 8;
      if (t >= 1) {
        a.mesh.removeFromParent();
        this.arrows.splice(i, 1);
      } else {
        a.mesh.position.lerpVectors(a.start, a.end, t);
        a.mesh.quaternion.setFromUnitVectors(
          new Vector3(0, 1, 0),
          a.end.clone().sub(a.start).normalize(),
        );
      }
    }
    for (const [id, o] of this.entities)
      if (!seen.has(id)) {
        this.disposeInstance(o);
        o.removeFromParent();
        this.entities.delete(id);
      }
  }
  preview(
    definition: string | null,
    x: number,
    y: number,
    allowed: boolean,
    field: HeightField,
  ) {
    this.ghost.visible = definition !== null;
    if (!definition) return;
    const footprint = content.get(definition).footprint!;
    this.ghost.scale.set(footprint.width, 1, footprint.depth);
    this.ghost.position.set(x, field.sample(x, y) + 0.15, y);
    this.ghost.material.color.set(allowed ? 0x68d893 : 0xf26960);
  }
  private disposeInstance(o: Object3D) {
    o.traverse((child) => {
      if (child instanceof Mesh && child.geometry !== this.ringGeometry)
        for (const m of Array.isArray(child.material)
          ? child.material
          : [child.material])
          m.dispose();
    });
  }
  destroy(scene: Scene) {
    this.dead = true;
    this.arrowGeometry.dispose();
    this.arrowMaterial.dispose();
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
    this.ringGeometry.dispose();
    this.ringMaterial.dispose();
    this.hpBack.dispose();
    this.hpFill.dispose();
    this.ghost.geometry.dispose();
    this.ghost.material.dispose();
    scene.remove(this.root);
  }
}
