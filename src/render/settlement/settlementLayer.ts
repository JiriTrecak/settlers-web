import {batchStaticMaterials} from '../prop/staticBatch';
import { ShellEffects } from "./shellEffects";
import { PresentationClock } from "./presentationClock";
import { StatusBadges } from "./statusBadges";
import { HarvestTrees } from "./harvestTrees";
import { pickUnitBody, type UnitPickBody } from "./unitPicking";
import type { Camera } from "three";
import { CommandFeedbackEffects } from "./commandFeedbackEffects";
import type { CommandFeedback } from "../../presentation/commandFeedback";
import { MineLabels } from "./mineLabels";
import { AbilityTarget, type AbilityAim } from "./abilityTarget";
import { batchCharacterMaterials } from "../characters/materialBatch";
import { ProjectileEffects } from "./projectileEffects";
import { SpellEffects } from "./spellEffects";
import { HealthPips } from "./healthPips";
import { HeldShortcuts } from "../../shared/input/heldShortcuts";
import { healthBarVisible } from "../../presentation/healthVisibility";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import {
  Group,
  BufferGeometry,
  Color,
  LineSegments,
  LineBasicMaterial,
  Object3D,
  Mesh,
  MeshStandardMaterial,
  BoxGeometry,
  PlaneGeometry,
  MeshBasicMaterial,
  Sprite,
  Vector3,
  type Scene,
  type Raycaster,
} from "three";
import { createCharacterInstance } from "../characters/character-player.js";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { content } from "../../content/builtin";
import { ownerSlot } from "../../content/schema";
import { projectMeshUrl } from "../../shared/assets/project";
import type { HeightField } from "../../shared/map/height";
import type { EntityView, SettlementView } from "../../sim/game/observation";
import { PLAYER_COLORS, clampPlayer } from "../../shared/player/player";
import { TEAM_COLOR_MATERIAL, applyPlayerMaterials } from "./playerMaterials";
import { prepareAntMaterial, prepareAntMaterials } from "../prop/antMaterials";
import { placementGrid } from "./placementGrid";

/** One scene adapter for observed entities. Models and pose variants come from asset declarations. */
export class SettlementLayer {
  private readonly root = new Group();
  private observedEntities: readonly EntityView[] | undefined;
  private modelEntities: readonly EntityView[] = [];
  private observedById = new Map<number,EntityView>();
  private readonly commandEffects = new CommandFeedbackEffects(this.root);
  commandFeedback(feedback: CommandFeedback, height: HeightField) {
    this.commandEffects.show(feedback, height);
  }
  private readonly harvestTrees = new HarvestTrees(this.root);
  private readonly presentationClock = new PresentationClock();
  private readonly abilityTarget = new AbilityTarget(this.root);
  targetAbility(aim: AbilityAim | null, height: HeightField) {
    this.abilityTarget.update(aim, height);
  }
  private readonly spellEffects = new SpellEffects(this.root);
  private readonly characterSources = new Map<string, GLTF>();
  private readonly characters = new Map<
    number,
    ReturnType<typeof createCharacterInstance>
  >();
  private readonly corpses = new Map<
    number,
    { root: Object3D; remaining: number; born: number }
  >();
  private readonly characterBatchDisposers: Array<() => void> = [];
  private readonly prototypes = new Map<string, Object3D>();
  private readonly entities = new Map<number, Object3D>();
  private selected = new Set<number>();
  private readonly parts = new WeakMap<
    Object3D,
    {
      body: Object3D;
      carry: Object3D | undefined;
      cargo: Group;
      selection: Group;
      hp: Sprite;
      mine?: Sprite;
    }
  >();
  private readonly targetPosition = new Vector3();
  private readonly shells = new ShellEffects(this.root);
  private readonly projectiles = new ProjectileEffects(this.root);
  private dead = false;
  private readonly selectionGeometry = new LineGeometry().setPositions([
    -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5, -0.5, 0, -0.5,
  ]);
  private readonly selectionMaterial = new LineMaterial({
    color: 0xffffff,
    linewidth: 3,
    worldUnits: false,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  private readonly attackTargetMaterial = new LineMaterial({
    color: 0xff3636,
    linewidth: 3,
    worldUnits: false,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  private readonly selectionFillGeometry = new PlaneGeometry(1, 1);
  private readonly selectionFillMaterial = new MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  private readonly statusBadges = new StatusBadges();
  private readonly healthPips = new HealthPips();
  private readonly healthKeys = new HeldShortcuts(['health.all','health.friendly','health.enemy']);
  private readonly mineLabels = new MineLabels();
  private readonly entranceGhost = new Mesh(
    new BoxGeometry(0.7, 0.12, 0.7),
    new MeshBasicMaterial({ color: 0xffed9d, depthWrite: false }),
  );
  private readonly ghost = new Mesh(
    new BufferGeometry(),
    new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.13,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  private readonly gridLines = new LineSegments(
    new BufferGeometry(),
    new LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    }),
  );
  private placementModel: Object3D | null = null;
  private placementAsset: string | null = null;
  private gridKey = "";
  private readonly invalidColor = new Color(0xf26960);
  private pendingPreview: (() => void) | null = null;
  readonly ready: Promise<void>;
  constructor(scene: Scene) {
    this.root.name = "game-entities";
    this.root.add(this.ghost, this.entranceGhost, this.gridLines);
    this.gridLines.visible = false;
    this.entranceGhost.visible = false;
    this.ghost.visible = false;
    scene.add(this.root);
    const loader = new GLTFLoader();
    this.ready = Promise.all([this.harvestTrees.ready, ...
      content.assets
        .filter(
          (a) =>
            a.file &&
            !a.sceneryAsset &&
            (content.definitions.some((d) => d.asset === a.id) ||
              content.assets.some((other) => other.carryAsset === a.id)),
        )
        .map(async (a) => {
          const url = projectMeshUrl(a.file!);
          if (!url) throw new Error(`Missing declared model ${a.file}`);
          const gltf = await loader.loadAsync(url);
          if (this.dead) { this.disposePrototype(gltf.scene); return; }
          if (!this.dead) {
            if (!a.character) {
              prepareAntMaterials(gltf.scene);
              this.characterBatchDisposers.push(batchStaticMaterials(gltf.scene,!!gltf.animations.length));
            }
            this.prototypes.set(a.id, gltf.scene);
            if (a.character) {
              this.characterBatchDisposers.push(
                batchCharacterMaterials(gltf.scene, gltf.animations),
              );
              this.characterSources.set(a.id, gltf);
            }
          }
        }),
    ]).then(() => {
      if (!this.dead) this.pendingPreview?.();
    });
  }
  select(ids: number | null | readonly number[]) {
    this.selected = new Set(
      ids === null ? [] : typeof ids === "number" ? [ids] : ids,
    );
  }
  pickUnit(camera: Camera, viewport: DOMRect, x: number, y: number): number | null {
    const bodies: UnitPickBody[] = [];
    for (const [id, root] of this.entities) {
      if (!root.visible || !root.userData.clickableUnit) continue;
      bodies.push({id, position: root.position, height: root.userData.pickHeight});
    }
    return pickUnitBody(bodies, camera, viewport, x, y);
  }
  pick(ray: Raycaster, maxDistance = Infinity) {
    const hit = ray
      .intersectObjects(
        [...this.entities.values(), ...this.harvestTrees.pickableRoots()].filter((o) => o.visible),
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
  /** Keep prepared material variants alive so the GPU program cache survives warm-up. */
  private warmModels: Object3D[] = [];
  private warmDisposers: Array<() => void> = [];
  prepareModels(): readonly Object3D[] {
    if (this.warmModels.length) return this.warmModels;
    for (const asset of this.prototypes.keys()) {
      const source = this.characterSources.get(asset);
      const character = source ? createCharacterInstance(source, content.asset(asset).character) : null;
      const model = character?.root ?? this.clone(asset);
      if (!model) continue;
      model.traverse(o => { if (o instanceof Mesh) {o.castShadow = true; o.receiveShadow = true;} });
      applyPlayerMaterials(model, 0);
      this.warmModels.push(model);
      this.warmDisposers.push(() => character ? character.dispose() : this.disposeInstance(model));
    }
    return this.warmModels;
  }
  /** HUD previews share loaded geometry/textures, but own their skeleton and materials. */
  createPortrait(definition: string, owner: number) {
    const asset = content.get(definition).asset;
    const source = this.characterSources.get(asset);
    const character = source ? createCharacterInstance(source, content.asset(asset).character) : null;
    const root = character?.root ?? this.clone(asset);
    if (!root) return null;
    applyPlayerMaterials(root, owner);
    root.traverse(o => { if(o instanceof Mesh){o.castShadow=false;o.receiveShadow=false;} });
    return { root, update: (dt:number) => character?.player.update(dt),
      dispose: () => character ? character.dispose() : this.disposeInstance(root) };
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
          copy.onBeforeCompile=m.onBeforeCompile;copy.customProgramCacheKey=m.customProgramCacheKey;
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
      this.removeModel(e.id, o);
      this.entities.delete(e.id);
      o = undefined;
    }
    if (o) return o;
    const source = this.characterSources.get(assetId);
    const character = source
      ? createCharacterInstance(source, content.asset(assetId).character)
      : null;
    if (character) this.characters.set(e.id, character);
    const model = character?.root ?? this.clone(assetId);
    if (character)
      model?.traverse((child) => {
        if (child instanceof Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
    if (!model) return null;
    o = new Group();
    model.name = "Body";
    o.add(model);
    o.userData.asset = assetId;
    o.userData.entityId = e.id;
    const asset = content.asset(assetId),
      scale = (asset.scale ?? 1) * (e.appearance?.scale ?? 1);
    o.userData.modelScale = scale;
    o.userData.pickHeight = asset.healthHeight ?? 2.5;
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
    const selection = new Group();
    selection.name = "Selection";
    selection.position.y = 0.12;
    selection.scale.set(
      d.footprint ? d.footprint.width + 0.3 : 1.8,
      1,
      d.footprint ? d.footprint.depth + 0.3 : 1.8,
    );
    const outline = new Line2(this.selectionGeometry, this.selectionMaterial);
    outline.raycast = () => {}; // Selection decoration must not intercept unit picking.
    selection.add(outline);
    if (d.kind === "building") {
      const fill = new Mesh(
        this.selectionFillGeometry,
        this.selectionFillMaterial,
      );
      fill.rotation.x = -Math.PI / 2;
      fill.raycast = () => {};
      selection.add(fill);
    }
    selection.visible = false;
    o.add(selection);
    const hp = new Sprite(
      this.healthPips.material(
        e.hp ?? 1,
        e.stats?.maxHp ?? d.body?.maxHp ?? 1,
        d.kind === "building",
        false,
      ),
    );
    hp.name = "Health";
    hp.position.set(0, asset.healthHeight ?? 2.5, 0);
    hp.scale.set(
      d.kind === "building" ? 3.8 : 1.35,
      d.kind === "building" ? 0.36 : 0.42,
      1,
    );
    hp.renderOrder = 21;
    hp.raycast = () => {};
    o.add(hp);
    let mine: Sprite | undefined;
    if (e.gathering) {
      mine = new Sprite(
        this.mineLabels.material(e.gathering.workers, e.gathering.capacity),
      );
      mine.name = "Mine occupancy";
      mine.position.set(0, (asset.healthHeight ?? 3) + 0.55, 0);
      mine.scale.set(4.4, 1.1, 1);
      mine.renderOrder = 22;
      mine.raycast = () => {};
      o.add(mine);
    }
    this.parts.set(o, {
      mine,
      body: model,
      carry: o.children.find((c) => c.name === "CarryBody"),
      cargo,
      selection,
      hp,
    });
    this.entities.set(e.id, o);
    this.root.add(o);
    return o;
  }
  update(
    state: SettlementView,
    field: HeightField,
    tick: number,
    timeScale = 1,
  ) {
    if(this.observedEntities!==state.entities){
      this.observedEntities=state.entities;
      this.modelEntities=state.entities.filter(e=>content.get(e.definition).kind!=="resource");
      this.observedById=new Map(this.modelEntities.map(e=>[e.id,e]));
    }
    const now = performance.now();
    const heldHealth = this.healthKeys.active();
    this.commandEffects.update(now);
    const {tick: renderTick, delta: dt, smoothingDelta} = this.presentationClock.sample(tick, now, timeScale);
    this.spellEffects.update(state.visuals ?? [], field, renderTick);
    this.harvestTrees.update(state.entities, field, renderTick);
    const commandedTargets = new Set(
      this.modelEntities
        .filter((e) => this.selected.has(e.id) && !e.unit?.contained)
        .map((e) => e.unit?.commandedTarget)
        .filter((id): id is number => id != null),
    );
    const byId = this.observedById;
    const seen = new Set<number>();
    for (const e of this.modelEntities) {
      const d = content.get(e.definition);
      seen.add(e.id);
      const o = this.make(e);
      if (!o) continue;
      o.visible = !e.unit?.contained;
      o.userData.clickableUnit = d.kind === "unit" && !e.remembered && (e.hp === null || e.hp > 0);
      applyPlayerMaterials(o, ownerSlot(e.owner));
      const parts = this.parts.get(o)!;
      if (parts.mine && e.gathering) {
        parts.mine.visible = !e.remembered;
        parts.mine.material = this.mineLabels.material(
          e.gathering.workers,
          e.gathering.capacity,
        );
      }
      const target = this.targetPosition.set(e.x, (e.unit?field.walkSample(e.x,e.y):field.sample(e.x, e.y)), e.y);
      if (e.unit && o.userData.placed) {
        const yaw=e.rotation*Math.PI/180;
        const delta=Math.atan2(Math.sin(yaw-o.rotation.y),Math.cos(yaw-o.rotation.y));
        const blend=timeScale===0?1:1-Math.exp(-smoothingDelta*60);
        o.rotation.y+=delta*blend;
        o.position.lerp(target, blend);
      } else {
        o.position.copy(target);
        o.rotation.y = (e.rotation * Math.PI) / 180;
        o.userData.placed = true;
      }
      o.userData.observedX = e.x;
      o.userData.observedZ = e.y;
      const character = this.characters.get(e.id);
      if (character && e.unit && o.visible) {
        const previousState = character.player.state;
        const attack = e.unit.attack;
        const attacked = !!attack && o.userData.attackStarted !== attack.started;
        if (attack) o.userData.attackStarted = attack.started;
        const hurt =
          o.userData.animationHp !== undefined &&
          e.hp !== null &&
          e.hp < o.userData.animationHp;
        const cast = e.unit.casting;
        const castStarted = !!cast && o.userData.castKey !== `${cast.ability}/${cast.resolveTick}`;
        if (cast) {
          const key = `${cast.ability}/${cast.resolveTick}`;
          if (o.userData.castKey !== key)
            character.player.setState("cast", { restart: true });
          o.userData.castKey = key;
          o.userData.castTimeline = cast;
        } else if (attack && !e.unit.moving) {
          character.player.setState("attack", { restart: attacked, fade: .04 });

        } else if (attacked) {
          character.player.setState("attack", { restart: true });

        } else if (hurt && !e.unit.moving && !e.unit.work?.cycle)
          character.player.setState("hit", { restart: true });
        else if (e.unit.moving)
          character.player.setState(e.unit.charging ? "charge" : e.unit.strolling ? "walk" : "run");
        else if (character.player.state === "cast" && o.userData.castTimeline && tick < o.userData.castTimeline.resolveTick)
          character.player.setState("idle", {fade:.05});
        else if (!attack && character.player.state === "attack") character.player.setState("idle", {fade:.05});
        else if (!["attack", "hit", "cast"].includes(character.player.state)) {
          const work =
            character.player.variant === "base" ? e.unit.work : undefined;
          character.player.setState(
            work?.animation ?? (e.unit.cargo ? "carry" : "idle"),
          );
          if (work) o.rotation.y = Math.atan2(work.x - e.x, work.y - e.y);
        }
        const cycle = e.unit.work?.cycle;
        if (attack && character.player.state === "attack") {
          const contact = character.player.attackContact();
          const phase = renderTick <= attack.impact
            ? contact * Math.max(0,renderTick-attack.started) / Math.max(1,attack.impact-attack.started)
            : contact + (1-contact) * (renderTick-attack.impact) / Math.max(1,attack.ends-attack.impact);
          character.player.seek(Math.min(.999999,phase));
        } else if (character.player.state === "cast" && o.userData.castTimeline) {
          const timeline=o.userData.castTimeline as NonNullable<NonNullable<EntityView['unit']>['casting']>;
          const contact=content.asset(e.appearance?.asset??d.asset).castContact??.55;
          // Windup follows authority, including late observations and long casts.
          // Recovery is visual only and yields to movement, attacks and damage.
          const phase=cast
            ? contact*Math.max(0,renderTick-timeline.startTick)/Math.max(1,timeline.resolveTick-timeline.startTick)
            : contact+(renderTick-timeline.resolveTick)/40*character.player.speed/character.player.action.getClip().duration;
          if(phase>=1) {character.player.setState("idle",{fade:.05});character.player.update(0);}
          else character.player.seek(Math.max(0,Math.min(cast?contact:.999999,phase)));
        } else if (cycle && character.player.state === e.unit.work?.animation) {
          // Authoritative work phase locks axe contact to the exact damage tick.
          character.player.seek(Math.min(.999999, (cycle.progress + renderTick - tick) / cycle.ticks));
        } else {
          // A newly observed reaction must not consume the time before it was observed.
          const restarted = castStarted || (hurt && character.player.state === "hit");
          character.player.update(previousState === character.player.state && !restarted ? dt : 0);
        }
        o.userData.animationHp = e.hp;
      }
      const { carry, body } = parts;
      if (carry) {
        carry.visible = !!e.unit?.cargo;
        body.visible = !carry.visible;
      }
      const buildProgress = e.construction
        ? Math.max(0.1, e.construction.progress / d.creation!.workTicks)
        : 1;
      body.scale.y = buildProgress * (o.userData.modelScale ?? 1);
      const selection = parts.selection;
      const attackTarget =
        commandedTargets.has(e.id) && !e.remembered && !e.unit?.contained;
      selection.visible = this.selected.has(e.id) || attackTarget;
      (selection.children[0] as Line2).material = attackTarget
        ? this.attackTargetMaterial
        : this.selectionMaterial;
      if (selection.children[1])
        selection.children[1].visible =
          this.selected.has(e.id) && !attackTarget;
      if (e.unit) selection.rotation.y = -o.rotation.y;
      this.statusBadges.update(o, e, tick, content.asset(d.asset).healthHeight ?? 2.5);
      const hp = parts.hp;
      if (
        e.hp !== null &&
        o.userData.previousHealth !== undefined &&
        e.hp < o.userData.previousHealth
      )
        o.userData.lastDamageTick = tick;
      o.userData.previousHealth = e.hp;
      hp.visible =
        !!d.body &&
        healthBarVisible(e,d.kind,e.stats?.maxHp ?? d.body.maxHp,this.selected.has(e.id),heldHealth);
      if (hp.visible && d.body) {
        const elapsed = tick - (o.userData.lastDamageTick ?? -Infinity);
        const blink =
          elapsed >= 0 && elapsed < 40 && Math.floor(elapsed / 5) % 2 === 0;
        hp.material = this.healthPips.material(
          e.hp!,
          e.stats?.maxHp ?? d.body.maxHp,
          d.kind === "building",
          blink,
        );
      }
      const cargo = parts.cargo;
      const cargoKey = e.unit?.cargo?.item ?? "";
      if (o.userData.cargoKey !== cargoKey) {
        for (const child of [...cargo.children]) {
          this.disposeInstance(child);
          child.removeFromParent();
        }
        if (cargoKey) {
          const item = this.clone(content.get(cargoKey).asset);
          if (item) {
            item.scale.setScalar(
              0.7 * (content.asset(content.get(cargoKey).asset).scale ?? 1),
            );
            cargo.add(item);
          }
        }
        o.userData.cargoKey = cargoKey;
      }
      if (e.unit && !character)
        o.traverse((child) => {
          if (child.name.startsWith("Leg") || child.name.startsWith("Arm"))
            child.rotation.x = e.unit!.moving
              ? Math.sin(renderTick * 0.3) * (child.name.includes("L") ? 1 : -1) * 0.5
              : 0;
        });
    }
    const launchPosition = (shot: {source:number}) => {
      const source = this.entities.get(shot.source);
      const observed = byId.get(shot.source);
      if (!source?.visible || !observed || observed.remembered) return undefined;
      const socket = content.asset(observed.appearance?.asset ?? content.get(observed.definition).asset).projectileSocket;
      return socket ? source.getObjectByName(socket)?.getWorldPosition(new Vector3()) : undefined;
    };
    this.shells.update(state.shells ?? [], field, renderTick, launchPosition);
    this.projectiles.update(renderTick, state.missiles ?? [], field, launchPosition);
    for (const [id, o] of this.entities)
      if (!seen.has(id)) {
        const character = this.characters.get(id);
        const death = state.deaths?.find((e) => e.id === id);
        if (character && death && o.visible) {
          character.player.setState("death", { restart: true });
          for (const name of ["Selection", "Health", "Cargo"]) {
            const part = o.getObjectByName(name);
            if (part) part.visible = false;
          }
          this.corpses.set(id, { root: o, remaining: 2, born: renderTick });
        } else this.removeModel(id, o);
        this.entities.delete(id);
      }
    for (const [id, corpse] of this.corpses) {
      const cell =
        Math.round(corpse.root.position.z) * field.size +
        Math.round(corpse.root.position.x);
      const corpseDelta = corpse.born === renderTick ? 0 : dt;
      corpse.remaining -= corpseDelta;
      if (corpse.remaining <= 0 || (state.fog && state.fog.cells[cell] !== 2)) {
        this.removeModel(id, corpse.root);
        this.corpses.delete(id);
      } else this.characters.get(id)?.player.update(corpseDelta);
    }
  }
  preview(
    definition: string | null,
    x: number,
    y: number,
    allowed: boolean,
    field: HeightField,
    rotation = 0,
    owner = 0,
  ) {
    this.pendingPreview = definition
      ? () => this.preview(definition, x, y, allowed, field, rotation, owner)
      : null;
    this.entranceGhost.visible =
      this.ghost.visible =
      this.gridLines.visible =
        definition !== null;
    if (this.placementModel) this.placementModel.visible = definition !== null;
    if (!definition) return;
    const d = content.get(definition),
      footprint = d.footprint!;
    if (this.placementAsset !== d.asset || !this.placementModel) {
      if (this.placementModel) {
        this.disposeInstance(this.placementModel);
        this.placementModel.removeFromParent();
      }
      this.placementModel = this.clone(d.asset);
      this.placementAsset = d.asset;
      if (this.placementModel) {
        this.placementModel.scale.setScalar(content.asset(d.asset).scale ?? 1);
        this.placementModel.traverse((child) => {
          if (!(child instanceof Mesh)) return;
          child.castShadow = false;
          child.receiveShadow = false;
          for (const material of Array.isArray(child.material)
            ? child.material
            : [child.material]) {
            material.transparent = true;
            material.opacity = 0.48;
            material.depthWrite = false;
            if (material instanceof MeshStandardMaterial)
              material.userData.placementColor = material.color.clone();
          }
        });
        this.root.add(this.placementModel);
      }
    }
    if (this.placementModel) {
      this.placementModel.position.set(x, field.sample(x, y), y);
      this.placementModel.rotation.y = (rotation * Math.PI) / 180;
      this.placementModel.traverse((child) => {
        if (!(child instanceof Mesh)) return;
        for (const material of Array.isArray(child.material)
          ? child.material
          : [child.material])
          if (material instanceof MeshStandardMaterial) {
            material.color.copy(material.userData.placementColor);
            if (material.name === TEAM_COLOR_MATERIAL && owner >= 0)
              material.color.set(PLAYER_COLORS[clampPlayer(owner)]);
            if (!allowed) material.color.lerp(this.invalidColor, 0.7);
          }
      });
    }
    const r = ((Math.round(rotation / 90) % 4) + 4) % 4;
    const width = r % 2 ? footprint.depth : footprint.width;
    const depth = r % 2 ? footprint.width : footprint.depth;
    const key = `${x}:${y}:${width}:${depth}`;
    if (key !== this.gridKey) {
      this.gridKey = key;
      const grid = placementGrid(x, y, width, depth, (a, b) =>
        field.sample(a, b),
      );
      this.ghost.geometry.dispose();
      this.gridLines.geometry.dispose();
      this.ghost.geometry = grid.fill;
      this.gridLines.geometry = grid.lines;
    }
    const offset = d.entrance ?? { x: 0, y: 0 };
    const ex = x + [offset.x, offset.y, -offset.x, -offset.y][r];
    const ey = y + [offset.y, -offset.x, -offset.y, offset.x][r];
    this.entranceGhost.position.set(ex, field.sample(ex, ey) + 0.2, ey);
    this.ghost.material.color.set(allowed ? 0xffffff : 0xf26960);
    this.gridLines.material.color.set(allowed ? 0xffffff : 0xf26960);
  }

  private removeModel(id: number, o: Object3D) {
    // Detach the character before disposing accessories; its factory owns rig/material cleanup.
    this.characters.get(id)?.dispose();
    this.characters.delete(id);
    o.getObjectByName("Selection")?.removeFromParent();
    this.disposeInstance(o);
    o.removeFromParent();
  }
  private disposeInstance(o: Object3D) {
    o.traverse((child) => {
      if (
        child instanceof Mesh &&
        child.geometry !== this.selectionFillGeometry &&
        child.geometry !== this.selectionGeometry
      )
        for (const m of Array.isArray(child.material)
          ? child.material
          : [child.material])
          m.dispose();
    });
  }
  private disposePrototype(root: Object3D) {
    const geometries=new Set<BufferGeometry>(),materials=new Set<import('three').Material>(),textures=new Set<import('three').Texture>();
    root.traverse(o=>{if(o instanceof Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});
    for(const material of materials){for(const value of Object.values(material))if(value && typeof value==='object' && value.isTexture)textures.add(value);material.dispose();}
    geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());
  }
  destroy(scene: Scene) {
    this.dead = true;
    this.warmDisposers.forEach(dispose => dispose());
    this.warmDisposers = []; this.warmModels = [];
    this.pendingPreview = null;
    if (this.placementModel) this.disposeInstance(this.placementModel);
    this.gridLines.geometry.dispose();
    this.gridLines.material.dispose();
    this.spellEffects.dispose();
    this.commandEffects.dispose();
    this.harvestTrees.dispose();
    this.abilityTarget.dispose();
    this.projectiles.dispose();
    this.shells.dispose();
    for (const [id, o] of this.entities) this.removeModel(id, o);
    for (const [id, corpse] of this.corpses) this.removeModel(id, corpse.root);
    for (const p of this.prototypes.values()) this.disposePrototype(p);
    this.prototypes.clear();this.characterSources.clear();
    this.characterBatchDisposers.forEach((dispose) => dispose());
    this.selectionGeometry.dispose();
    this.selectionMaterial.dispose();
    this.attackTargetMaterial.dispose();
    this.selectionFillGeometry.dispose();
    this.selectionFillMaterial.dispose();
    this.statusBadges.dispose();
    this.healthPips.dispose();
    this.healthKeys.dispose();
    this.mineLabels.dispose();
    this.entranceGhost.geometry.dispose();
    this.entranceGhost.material.dispose();
    this.ghost.geometry.dispose();
    this.ghost.material.dispose();
    scene.remove(this.root);
  }
}
