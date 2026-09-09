import { PresentationView, matchSpeed } from "./presentationView";
import { createSkirmishMatch, defaultSlots } from "../../shared/match/skirmish";
import { precise } from "../../sim/game/motion";
import { localSaveSchema } from "./localSave";
import { SAVE_FORMAT_VERSION } from "../../shared/save/save";
import { areaSelection } from "../../presentation/commands";
import { resourceStamps } from "../../presentation/scenery";
import { content } from "../../content/builtin";
import { slotOwner } from "../../content/schema";
import { perf } from "../../debug/performance";
import { EditorBridge } from "../../shared/control/editorBridge";
import { validAction } from "../../shared/types/types";
import { getMap, type MapEntry } from "../../shared/map/library";
import { requirePlayableMap } from "../../shared/map/playable";
import { emptyLandscape } from "../../shared/landscape/curve";
import {
  HeightField,
  decodeHeight,
  type MapStamp,
  type Action,
} from "../../shared";
import { projectCatalogue, projectMeshUrl } from "../../shared/assets/project";
import { SettlementHud } from "../../ui/settlement/settlementHud";

/**
 * One match: transport, fixed-step simulation, input and presentation orchestration.
 */
import { type MatchConfig } from "../../shared";
import { Lockstep, MemoryChannel, Room, type Channel } from "../../net";
import { MapInput, Minimap, Renderer } from "../../render";
import { World } from "../../sim/world/world";
import type { HudState } from "../../ui";

export type SessionHooks = {
  onHud: (state: HudState) => void;
};

export type SessionConfig = {
  player: number | null;
  mapId: string;
  host: HTMLElement;
  channel?: Channel;
  match?: MatchConfig;
  hooks: SessionHooks;
};

export class Session {
  private loadedMap: MapEntry | null = null;
  private world: World | null = null;
  private room: Room | null = null;
  private renderer: Renderer | null = null;
  private input: MapInput | null = null;
  private mini: Minimap | null = null;
  private readonly locksteps = new Map<number, Lockstep>();
  private readonly channels: MemoryChannel[] = [];
  private match: MatchConfig | null = null;
  private acc = 0;
  private fps = 60;
  private fpsFrames = 0;
  private fpsMs = 0;
  private confirmTimer: ReturnType<typeof setInterval> | null = null;
  private matchStartMs = 0;
  private desynced = false;
  /** Transport mailbox, not authority. An observer borrows an empty local mailbox. */
  private readonly me: number;
  private presentation = new PresentationView();
  private reveal = false;
  private speed = 1;
  private visionPlayer: number;
  private unbindDebug: (() => void) | null = null;
  private get observing(): boolean {
    return this.config.player === null;
  }
  private get simulationSpeed(): number {
    return matchSpeed(this.speed, !!this.config.channel);
  }
  private visualView() {
    return (this.presentation ??= new PresentationView()).project(
      this.world!,
      this.visionPlayer ?? this.me,
      this.reveal,
    );
  }
  private selectionView() {
    return this.observing
      ? this.visualView().settlement!
      : this.world!.settlement!.view(this.me);
  }

  private bridge: EditorBridge | null = null;
  private terrain = new HeightField();
  private stamps: readonly MapStamp[] = [];
  private resourceSignature = "";
  private economyHud: SettlementHud | null = null;
  private placementPointer: { clientX: number; clientY: number } | null = null;
  private readonly onHover = (e: { clientX: number; clientY: number }) => {
    this.placementPointer = { clientX: e.clientX, clientY: e.clientY };
    const hit = this.renderer?.pickGround(e.clientX, e.clientY),
      kind = this.economyHud?.mode;
    const binding = this.economyHud?.targeting,
      sim = this.world?.settlement;
    const caster =
      binding?.type === "cast" ? sim?.context.get(binding.actors[0]) : null;
    const spell = binding?.ability
      ? content.rules.spells[binding.ability]
      : null;
    const rank = binding?.ability
      ? caster?.spellcasting?.learned[binding.ability]
      : 0;
    if (hit && caster && spell && rank) {
      const origin = precise(caster),
        point = { x: Math.round(hit.x), y: Math.round(hit.z) };
      const valid =
        Math.hypot(point.x - origin.x, point.y - origin.y) <=
          spell.ranks[rank - 1].range &&
        !!sim?.observation.explored(slotOwner(this.me), [
          sim.spatial.cell(point),
        ]);
      this.renderer?.gameAbilityTarget({ spell, rank, origin, point, valid });
    } else this.renderer?.gameAbilityTarget(null);
    if (!hit || !kind) {
      this.renderer?.gamePreview(null);
      return;
    }
    const x = Math.round(hit.x),
      z = Math.round(hit.z),
      error =
        this.world?.settlement?.canBuild(
          slotOwner(this.me),
          kind,
          { x, y: z },
          this.economyHud?.buildingActor,
          this.economyHud?.placementRotation ?? 0,
        ) ?? null;
    this.renderer?.gamePreview(
      kind,
      x,
      z,
      !error,
      this.economyHud?.placementRotation ?? 0,
      this.me,
    );
    this.economyHud?.placement(error);
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly config: SessionConfig,
  ) {
    if (config.channel && config.player === null)
      throw new Error("Network observers require a spectator connection.");
    this.me =
      config.player ??
      config.match?.slots[0]?.player ??
      getMap(config.mapId).map.playerStarts[0].player - 1;
    this.visionPlayer = this.me;
    this.reveal = this.observing;
  }

  start(): void {
    const loaded = (this.loadedMap = getMap(
      this.config.match?.mapId ?? this.config.mapId,
    ));
    const map = requirePlayableMap(loaded.map);
    const match =
      this.config.match ??
      createSkirmishMatch(
        {
          mapId: loaded.id,
          slots: defaultSlots(map.playerStarts, this.config.player),
        },
        map.playerStarts,
        loaded.revision,
      ).match;
    this.match = match;
    if (match.mapId !== loaded.id || match.mapRevision !== loaded.revision)
      throw new Error(
        "This match uses a different map or gameplay rules revision. Reload both clients.",
      );
    if (
      !match.slots.some((slot) => slot.player === this.me) ||
      (!this.observing &&
        match.slots.find((slot) => slot.player === this.me)?.kind !==
          "human") ||
      (this.observing && match.slots.some((slot) => slot.kind === "human"))
    )
      throw new Error(
        "The local controller must match the lobby's player slots.",
      );
    this.world = new World({
      slots: match.slots,
      seed: match.seed,
      map,
    });
    const catalog = projectCatalogue(),
      urls = new Map(
        catalog.assets.flatMap((a) => {
          const url = projectMeshUrl(a.file);
          return url ? [[a.id, url] as [string, string]] : [];
        }),
      );
    const renderer = new Renderer(this.canvas, urls);
    renderer.setKinds(new Map(catalog.assets.map((a) => [a.id, a.type])));
    this.terrain = new HeightField(map.size);
    this.terrain.load(
      map.height ? decodeHeight(map.height, map.size)! : [],
      map.waterLevel ?? 0,
    );
    renderer.setTerrain(this.terrain);
    renderer.setLandscape(map.landscape ?? emptyLandscape());
    renderer.sky.setPlaying(true);
    renderer.setGridMode("none");
    this.stamps = [
      ...map.stamps,
      ...resourceStamps(this.visualView().settlement!.entities),
    ];
    this.renderer = renderer;
    const self = map.playerStarts.find((p) => p.player === this.me + 1)!;
    renderer.camera.lookAt(self.x, self.z);
    renderer.camera.setGame(true, map.size);
    this.input = new MapInput(this.canvas, renderer.camera, {
      onChanged: () => this.present(),
      rts: true,
      onClick: (x, y, shift) => this.click(x, y, shift),
      onRightClick: (x, y) => this.click(x, y, false, true),
      onSelectArea: (rect, shift) => {
        const hud = this.economyHud,
          state = this.world ? this.selectionView() : undefined;
        if (!hud || !state) return;
        const inside = new Set(
          renderer.unitsInScreenRect(
            state.entities.filter((e) => e.unit && !e.unit.contained),
            rect,
          ),
        );
        const ids = this.observing
          ? [...inside]
          : areaSelection(
              state.entities.filter((w) => inside.has(w.id)),
              slotOwner(this.me),
              content,
            );
        hud.setSelection(shift ? [...hud.selectedIds, ...ids] : ids);
      },
    });
    this.economyHud = new SettlementHud(this.config.host, this.config.player, {
      action: (action) => this.send(action),
      mode: () => {
        if (this.placementPointer) this.onHover(this.placementPointer);
        else {
          renderer.gamePreview(null);
          renderer.gameAbilityTarget(null);
        }
      },
      home: () => {
        const game = this.world?.settlement,
          home = game?.entities.find(
            (e) => e.id === game.state.objectives[slotOwner(this.me)],
          );
        if (home) renderer.camera.lookAt(home.x, home.y);
      },
    });
    this.economyHud.setMapName(
      this.observing ? "Observing · " + map.name : map.name,
    );
    this.canvas.addEventListener("pointermove", this.onHover);
    this.mini = new Minimap(this.config.host, {
      camera: renderer.camera,
      clock: () => renderer.sky.snapshot(),
      viewport: () => ({
        w: this.canvas.clientWidth,
        h: this.canvas.clientHeight,
      }),
      onLookAt: (x, z) => {
        renderer.camera.lookAt(x, z);
        this.present();
      },
    });
    this.mini.mountGame(this.economyHud.minimapHost, this.economyHud.clockHost);
    if (this.config.channel) {
      this.bindRemote(match, this.config.channel);
      this.armConfirms(match);
    } else {
      this.bindLockstep(match);
    }
    this.mini.setHeight(this.terrain);
    this.mini.setStamps(this.stamps);
    this.mini.setPlayerStarts(
      (map.playerStarts ?? []).filter((s) => s.player === this.me + 1),
    );
    const initialView = this.visualView();
    this.mini.setFog(initialView.settlement!);
    this.economyHud.update(this.selectionView());
    renderer.draw(initialView, this.stamps);
    this.unbindDebug = perf.bindMatch({
      reveal: this.reveal,
      speed: this.simulationSpeed,
      remote: !!this.config.channel,
      visionPlayer: this.visionPlayer,
      players: match.slots,
      onReveal: (value) => {
        if (!this.config.channel) {
          this.reveal = value;
          this.resourceSignature = "";
        }
      },
      onSpeed: (value) => {
        this.speed = matchSpeed(value, !!this.config.channel);
        renderer.gameTimeScale = this.simulationSpeed;
      },
      onVision: (player) => {
        if (
          !this.config.channel &&
          match.slots.some((s) => s.player === player)
        ) {
          this.visionPlayer = player;
          this.resourceSignature = "";
          this.economyHud?.setSelection([]);
        }
      },
    });
    this.mini?.paint();
    this.bridge = new EditorBridge({
      dispatch: async (op, params) => {
        const o = (params ?? {}) as Record<string, unknown>;
        if (op === "gameStatus")
          return {
            map: match.mapId,
            revision: match.mapRevision,
            player: this.config.player,
            observing: this.observing,
            speed: this.simulationSpeed,
            reveal: this.reveal,
            tick: this.world!.clock.tickIndex,
            checksum: this.world!.checksum(),
            settlement: this.world!.settlement!.view(this.me),
            desynced: this.desynced,
            hud: {
              text: this.economyHud?.root.innerText,
              selection: this.economyHud?.selectedIds,
              commands: [
                ...this.economyHud!.root.querySelectorAll("button"),
              ].map((b) => ({
                name: b.getAttribute("aria-label"),
                disabled: b.disabled,
              })),
            },
          };
        if (op === "gameSave") return this.snapshotLocal();
        if (op === "gameLoad") {
          this.restoreLocal(o.save);
          return { restored: true };
        }
        if (op === "gameSelection") {
          if (
            !Array.isArray(o.ids) ||
            !o.ids.every((id) => Number.isSafeInteger(id))
          )
            throw new Error("Selection requires numeric IDs");
          this.economyHud!.setSelection(o.ids as number[]);
          return { selection: this.economyHud!.selectedIds };
        }
        if (op === "gameCommand") {
          if (!validAction(o.action))
            throw new Error("Invalid gameplay action");
          if (!this.send(o.action))
            throw new Error("Observers cannot issue player commands");
          return { queued: true, player: this.me };
        }
        if (op === "gameView") {
          if (typeof o.x === "number" && typeof o.z === "number")
            renderer.camera.lookAt(o.x, o.z);
          if (typeof o.gameZoom === "number")
            renderer.camera.pose({ gameZoom: o.gameZoom });
          this.present();
          return { x: renderer.camera.targetX, z: renderer.camera.targetZ };
        }
        if (op === "screenshot") {
          await renderer.ready();
          await renderer.gameReady();
          const canvas = renderer.capture(
            Number(o.maxWidth) || 1280,
            Number(o.aspect) || 16 / 9,
            12,
          );
          const data = canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
          return {
            data,
            mime: "image/jpeg",
            width: canvas.width,
            height: canvas.height,
            mapName: match.mapId,
            environment: renderer.sky.snapshot(),
            view: {
              x: renderer.camera.targetX,
              z: renderer.camera.targetZ,
              gameCam: true,
              gameZoom: renderer.camera.gameZoom,
            },
          };
        }
        throw new Error("This tab is playing. Use game tools.");
      },
    });
    this.bridge.start();
  }

  private present(): void {
    this.renderer?.present();
    this.mini?.paint();
  }

  tick(dtMs: number, _nowMs: number): void {
    const renderer = this.renderer;
    const world = this.world;
    if (!renderer || !world) return;
    const simulation = perf.start();
    const remote = this.config.channel != null;
    if (remote && !this.desynced) this.pulseConfirm();
    this.acc += Math.max(0, dtMs) * this.simulationSpeed;
    const step = world.clock.tickMs;
    const cap = remote ? 2 : 8 * this.simulationSpeed;
    let n = 0;
    while (this.acc >= step && n < cap) {
      const next = world.clock.tickIndex + 1;
      if (!remote) for (const ls of this.locksteps.values()) ls.confirm(next);
      const commit = this.locksteps.get(this.me)?.take(next);
      if (!commit) {
        if (remote) this.acc = Math.min(this.acc, step);
        break;
      }
      for (const slot of commit.slots) {
        for (let i = 0; i < slot.actions.length; i++) {
          world.enqueue(slot.actions[i]!, next, {
            player: slot.player,
            seq: i,
          });
        }
      }
      this.acc -= step;
      for (const [id, peer] of this.locksteps)
        if (id !== this.me) peer.take(next);
      world.tick();
      for (const [name, ms] of Object.entries(world.settlement?.timings ?? {}))
        perf.sample(`Sim · ${name}`, ms);
      if (perf.enabled)
        for (const [name, ms] of Object.entries(world.aiTimings ?? {}))
          perf.sample(`AI decision · ${name}`, ms);
      if (perf.enabled && next % 40 === 0)
        for (const ai of world.aiSummary()) {
          perf.value(`AI ${ai.owner}`, `${ai.mission} · ${ai.economy}`);
          perf.value(`AI ${ai.owner} reason`, ai.reason);
          perf.value(
            `AI ${ai.owner} commands`,
            `${ai.metrics.accepted} accepted / ${ai.metrics.rejected} rejected`,
          );
        }
      const ch = this.config.channel;
      if (ch && next % matchChecksumEvery(this.match) === 0) {
        ch.send({ type: "hash", tick: next, checksum: world.checksum() });
      }
      n++;
    }
    if (n >= cap && !remote) this.acc %= step;
    perf.end("Simulation / lockstep", simulation);
    // Keep the authoritative match and network running in a hidden tab, but
    // defer snapshots, DOM, animation, minimap and GPU work until it is visible.
    // This also prevents a stale edge-hover from moving an unseen camera.
    if (document.hidden) {
      this.fpsFrames = 0;
      this.fpsMs = 0;
      return;
    }
    const input = perf.start();
    this.input?.tick(dtMs);
    perf.end("Input", input);
    const snapshot = perf.start();
    const view = this.visualView();
    perf.end("View snapshot", snapshot);
    const hud = perf.start();
    if (view.settlement) {
      const resources = resourceStamps(view.settlement.entities),
        signature = JSON.stringify(resources);
      if (signature !== this.resourceSignature) {
        this.resourceSignature = signature;
        this.stamps = [...this.loadedMap!.map.stamps, ...resources];
        this.mini?.setStamps(this.stamps);
      }
      this.mini?.setPlayerStarts(
        this.loadedMap!.map.playerStarts.filter(
          (start) =>
            (view.settlement.fog?.cells[start.z * view.size + start.x] ?? 0) >
            0,
        ),
      );
      this.mini?.setFog(view.settlement);
      this.economyHud?.update(this.selectionView());
      renderer.gameSelect(this.economyHud?.selectedIds ?? []);
      this.canvas.style.cursor = this.economyHud?.attackMode
        ? "crosshair"
        : "default";
    }
    perf.end("Economy HUD / minimap data", hud);
    if (this.economyHud?.targeting?.type === "cast" && this.placementPointer)
      this.onHover(this.placementPointer);
    renderer.draw(view, this.stamps);
    const minimap = perf.start();
    this.mini?.paint();
    perf.end("Minimap paint", minimap);
    this.fpsFrames += 1;
    this.fpsMs += dtMs;
    if (this.fpsMs >= 1000) {
      this.fps = Math.round((this.fpsFrames * 1000) / this.fpsMs);
      this.fpsFrames = 0;
      this.fpsMs = 0;
    }
    this.config.hooks.onHud({ fps: this.fps, zoom: renderer.camera.distance });
  }

  snapshotLocal() {
    if (!this.room || !this.world || !this.match || this.config.channel)
      throw new Error("Local saves require a singleplayer match");
    const local = this.locksteps.get(this.me)!;
    return {
      v: SAVE_FORMAT_VERSION,
      remote: false as const,
      mapId: this.match.mapId,
      mapRevision: this.match.mapRevision,
      seed: this.match.seed,
      world: this.world.snapshot(),
      pipeline: {
        ...this.room.snapshot(),
        commits: local.peek(),
        sentThrough: local.sent(),
      },
      clients: [...this.locksteps].map(([player, peer]) => ({
        player,
        sentThrough: peer.sent(),
        outbox: peer.outbox(),
      })),
    };
  }
  restoreLocal(raw: unknown) {
    if (this.config.channel || !this.match || !this.loadedMap)
      throw new Error("Local load requires a singleplayer match");
    const save = localSaveSchema.parse(raw);
    if (
      save.mapId !== this.match.mapId ||
      save.mapRevision !== this.match.mapRevision
    )
      throw new Error(
        "Open the same map and content revision before loading this save.",
      );
    const restored = new World({
      map: this.loadedMap.map,
      slots: this.match.slots,
      seed: save.seed,
    });
    restored.restore(save.world);
    const tick = restored.clock.tickIndex,
      players = this.match.slots.map((s) => s.player).sort((a, b) => a - b),
      pipeline = save.pipeline;
    if (
      pipeline.committed < tick ||
      pipeline.commits.length !== pipeline.committed - tick ||
      pipeline.commits.some(
        (c, i) =>
          c.tick !== tick + i + 1 ||
          c.slots.length !== players.length ||
          c.slots.some((s, j) => s.player !== players[j]),
      ) ||
      save.clients.length !== players.length ||
      new Set(save.clients.map((c) => c.player)).size !== players.length ||
      save.clients.some((c) => !players.includes(c.player)) ||
      pipeline.held.some(
        (h) => h.tick <= pipeline.committed || !players.includes(h.player),
      ) ||
      pipeline.through.length !== players.length ||
      new Set(pipeline.through.map((p) => p.player)).size !== players.length ||
      pipeline.through.some((p) => !players.includes(p.player))
    )
      throw new Error("Invalid saved command pipeline");
    for (const channel of this.channels) channel.destroy();
    this.channels.length = 0;
    this.locksteps.clear();
    this.match = { ...this.match, seed: save.seed };
    this.bindLockstep(this.match);
    this.room!.resume(pipeline);
    for (const client of save.clients)
      this.locksteps
        .get(client.player)!
        .restore(pipeline.commits, client.sentThrough, client.outbox);
    this.world = restored;
    this.acc = 0;
    this.resourceSignature = "";
    this.economyHud?.setSelection([]);
  }
  private send(action: Action): boolean {
    if (this.observing) return false;
    const peer = this.locksteps.get(this.me);
    if (!peer) return false;
    peer.send(action);
    return true;
  }
  private click(
    clientX: number,
    clientY: number,
    shift = false,
    right = false,
  ) {
    const sim = this.world?.settlement,
      hit = this.renderer?.pickGround(clientX, clientY),
      hud = this.economyHud;
    if (right && hud?.targeting) {
      hud.clearMode();
      return;
    }
    if (!sim || !hit || !hud) return;
    const x = Math.round(hit.x),
      z = Math.round(hit.z);
    const owner = slotOwner(this.me),
      position = { x, y: z },
      binding = hud.targeting;
    if (hud.rallyMode && binding) {
      this.send({
        type: "rally",
        actor: binding.actors[0]!,
        destination: position,
      });
      hud.clearMode();
      return;
    }
    if (hud.mode) {
      const error = sim.canBuild(
        owner,
        hud.mode,
        position,
        hud.buildingActor,
        hud.placementRotation,
      );
      if (error) {
        hud.placement(error);
        return;
      }
      const action: Extract<Action, { type: "build" }> = {
        type: "build",
        actor: hud.buildingActor!,
        definition: hud.mode,
        position,
        rotation: hud.placementRotation,
      };
      this.send(action);
      if (!shift) {
        hud.clearMode();
      }
      return;
    }
    const known = this.selectionView(),
      picked = this.renderer?.pickGameEntity(clientX, clientY);
    const selectable = known.entities.filter(
      (e) =>
        !e.unit?.contained && content.get(e.definition).selectable !== false,
    );
    const target =
      selectable.find((e) => e.id === picked) ??
      selectable.find((e) => {
        const d = content.get(e.definition),
          r = d.footprint
            ? Math.max(d.footprint.width, d.footprint.depth) / 2
            : 0.8;
        return Math.abs(e.x - hit.x) <= r && Math.abs(e.y - hit.z) <= r;
      });
    if (this.observing) {
      if (!right)
        hud.setSelection(
          target
            ? shift
              ? [...hud.selectedIds.filter((id) => id !== target.id), target.id]
              : [target.id]
            : shift
              ? [...hud.selectedIds]
              : [],
        );
      return;
    }
    const selected = known.entities.filter(
      (e) =>
        hud.selectedIds.includes(e.id) &&
        e.owner === owner &&
        e.unit &&
        content.get(e.definition).behaviors.playerControl,
    );
    const army = selected.filter(
      (e) => content.get(e.definition).behaviors.combat,
    );
    if (hud.attackMode) {
      if (target && !target.remembered)
        this.send({
          type: "attack",
          actors: binding!.actors,
          target: target.id,
          force: true,
        });
      else
        this.send({
          type: "move",
          actors: binding!.actors,
          destination: position,
          attackMove: true,
        });
      hud.clearMode();
      return;
    }
    if (binding?.type === "cast" && binding.ability) {
      const caster = sim.context.get(binding.actors[0]),
        spell = content.rules.spells[binding.ability],
        rank = caster?.spellcasting?.learned[binding.ability];
      if (
        !caster ||
        !rank ||
        Math.hypot(
          position.x - precise(caster).x,
          position.y - precise(caster).y,
        ) > spell.ranks[rank - 1].range ||
        !sim.observation.explored(owner, [sim.spatial.cell(position)])
      )
        return;
      this.send({
        type: "cast",
        actor: binding.actors[0],
        ability: binding.ability,
        point: position,
      });
      hud.clearMode();
      return;
    }
    if (binding?.type === "move") {
      this.send({
        type: "move",
        actors: binding.actors,
        destination: position,
      });
      hud.clearMode();
      return;
    }
    if (target) {
      if (right && target.resource && !target.remembered) {
        const workers = selected.filter((e) =>
          content.get(e.definition).behaviors.work?.harvests?.some((id) => {
            const recipe = content.get(id).creation;
            return (
              recipe?.method === "harvest" &&
              recipe.source === target.definition
            );
          }),
        );
        if (workers.length) {
          this.send({
            type: "gather",
            actors: workers.map((e) => e.id),
            target: target.id,
          });
          return;
        }
      }
      if (
        right &&
        target.item &&
        !target.remembered &&
        content.get(target.definition).itemEffect
      ) {
        const hero = selected.find(
          (e) => content.get(e.definition).behaviors.inventory,
        );
        if (hero) {
          this.send({ type: "pickup", actor: hero.id, target: target.id });
          return;
        }
      }
      if (
        right &&
        army.length &&
        target.owner !== owner &&
        target.owner !== "none" &&
        !target.remembered &&
        !shift
      ) {
        this.send({
          type: "attack",
          actors: army.map((e) => e.id),
          target: target.id,
        });
        return;
      }
      if (
        right &&
        army.length &&
        target.owner === "none" &&
        target.unit &&
        !target.remembered &&
        !shift
      ) {
        this.send({
          type: "attack",
          actors: army.map((e) => e.id),
          target: target.id,
        });
        return;
      }
      if (right) {
        if (selected.length)
          this.send({
            type: "move",
            actors: selected.map((e) => e.id),
            destination: position,
          });
        return;
      }
      if (shift && target.owner === owner && target.unit) {
        const ids = selected.map((e) => e.id);
        hud.setSelection(
          ids.includes(target.id)
            ? ids.filter((id) => id !== target.id)
            : [...ids, target.id],
        );
      } else hud.selected = target.id;
      return;
    }
    if (right && selected.length)
      this.send({
        type: "move",
        actors: selected.map((e) => e.id),
        destination: position,
      });
    else if (!right && !shift) hud.selected = null;
  }

  stop(): void {
    this.unbindDebug?.();
    this.unbindDebug = null;
    this.canvas.style.cursor = "";
    if (this.confirmTimer != null) clearInterval(this.confirmTimer);
    this.confirmTimer = null;
    this.canvas.removeEventListener("pointermove", this.onHover);
    this.economyHud?.destroy();
    this.economyHud = null;
    this.input?.destroy();
    this.input = null;
    this.mini?.destroy();
    this.mini = null;
    this.renderer?.destroy();
    this.renderer = null;
    this.bridge?.stop();
    this.bridge = null;
    this.world = null;
    this.locksteps.clear();
    for (const channel of this.channels) channel.destroy();
    this.channels.length = 0;
  }

  private bindLockstep(match: MatchConfig): void {
    const room = (this.room = new Room(match));
    for (const slot of match.slots) {
      const ch = new MemoryChannel(room, slot.player);
      this.channels.push(ch);
      this.locksteps.set(
        slot.player,
        new Lockstep(ch, slot.player, match.delay),
      );
    }
  }

  private bindRemote(match: MatchConfig, channel: Channel): void {
    const wrapped: Channel = {
      send: (msg) => channel.send(msg),
      onMessage: (fn) => {
        channel.onMessage((msg) => {
          if (msg.type === "desync") this.desynced = true;
          fn(msg);
        });
      },
    };
    this.locksteps.set(this.me, new Lockstep(wrapped, this.me, match.delay));
  }

  private armConfirms(match: MatchConfig): void {
    if (this.confirmTimer != null) clearInterval(this.confirmTimer);
    this.matchStartMs = performance.now();
    this.confirmTimer = setInterval(() => this.pulseConfirm(), match.tickMs);
    this.pulseConfirm();
  }

  private pulseConfirm(): void {
    const world = this.world;
    if (!world || this.desynced) return;
    const next = world.clock.tickIndex + 1;
    const elapsed = Math.max(
      0,
      Math.floor((performance.now() - this.matchStartMs) / world.clock.tickMs),
    );
    for (const ls of this.locksteps.values()) {
      const through = Math.min(
        world.clock.tickIndex + 200,
        Math.max(next, elapsed + 1, world.clock.tickIndex + ls.delay),
      );
      ls.confirm(through);
    }
  }
}

function matchChecksumEvery(match: MatchConfig | null): number {
  return match?.checksumEvery ?? 8;
}
