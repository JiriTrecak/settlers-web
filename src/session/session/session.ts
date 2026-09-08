import { isSoldier } from '../../shared/settlement/rules';
import {perf} from '../../debug/performance';
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
import { BUILDINGS } from "../../shared/settlement/rules";
/**
 * One match: transport, fixed-step simulation, input and presentation orchestration.
 */
import { MAP_SIZE, localMatch, type MatchConfig } from "../../shared";
import { Lockstep, MemoryChannel, Room, type Channel } from "../../net";
import { MapInput, Minimap, Renderer } from "../../render";
import { World } from "../../sim/world/world";
import type { HudState } from "../../ui";

export type SessionHooks = {
  onHud: (state: HudState) => void;
};

export type SessionConfig = {
  player: number;
  mapId: string;
  host: HTMLElement;
  channel?: Channel;
  match?: MatchConfig;
  hooks: SessionHooks;
};

export class Session {
  private loadedMap: MapEntry | null = null;
  private world: World | null = null;
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
  private readonly me: number;
  private bridge: EditorBridge | null = null;
  private terrain = new HeightField();
  private stamps: readonly MapStamp[] = [];
  private resourceRevision = -1;
  private economyHud: SettlementHud | null = null;
  private readonly onHover = (e: PointerEvent) => {
    const hit = this.renderer?.pickGround(e.clientX, e.clientY),
      kind = this.economyHud?.mode;
    if (!hit || !kind) {
      this.renderer?.gamePreview(null);
      return;
    }
    const x = Math.round(hit.x),
      z = Math.round(hit.z),
      error = this.world?.settlement?.canBuild(this.me, kind, x, z) ?? null;
    this.renderer?.gamePreview(kind, x, z, !error);
    this.economyHud?.placement(error);
  };
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") this.economyHud?.clearMode();
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly config: SessionConfig,
  ) {
    this.me = config.match ? config.player : Math.min(1, config.player);
  }

  start(): void {
    const loaded=this.loadedMap=getMap(this.config.match?.mapId ?? this.config.mapId);
    const map=requirePlayableMap(loaded.map);
    const match =
      this.config.match ??
      localMatch({
        mapId: loaded.id,
        mapRevision: loaded.revision,
        seed: 1,
        slotCount: loaded.players,
        me: this.me,
      });
    this.match = match;
    if (
      match.mapId !== loaded.id ||
      match.mapRevision !== loaded.revision
    )
      throw new Error(
        "This match uses a different map or gameplay rules revision. Reload both clients.",
      );
    this.world = new World({
      size: MAP_SIZE,
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
    this.terrain.load(
      map.height ? decodeHeight(map.height)! : [],
      map.waterLevel ?? 0,
    );
    renderer.setTerrain(this.terrain);
    renderer.setLandscape(map.landscape ?? emptyLandscape());
    renderer.setGridMode("none");
    this.stamps = map.stamps;
    this.renderer = renderer;
    const self =
      this.world.players.find((p) => p.id === this.me) ?? this.world.players[0];
    if (self) renderer.camera.lookAt(self.pos.x + 0.5, self.pos.y + 0.5);
    renderer.camera.setGame(true);
    this.input = new MapInput(this.canvas, renderer.camera, {
      onChanged: () => this.present(),
      onClick: (x, y) => this.click(x, y),
    });
    this.economyHud = new SettlementHud(this.config.host, this.me, {
      action: action => this.send(action),
      mode: () => renderer.gamePreview(null),
      cancel: (id) => this.send({ type: "cancel-building", id }),
      home: () => {
        const home = this.world?.settlement?.buildings.find(
          (b) => b.owner === this.me && b.complete && b.kind === "fort",
        );
        if (home) renderer.camera.lookAt(home.x, home.z);
      },
    });
    this.economyHud.setMapName(map.name);
    this.canvas.addEventListener("pointermove", this.onHover);
    window.addEventListener("keydown", this.onKey);
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
    this.mini.mountGame(this.economyHud.minimapHost,this.economyHud.clockHost);
    if (this.config.channel) {
      this.bindRemote(match, this.config.channel);
      this.armConfirms(match);
    } else {
      this.bindLockstep(match);
    }
    this.mini.setHeight(this.terrain);
    this.mini.setStamps(this.stamps);
    this.mini.setPlayerStarts((map.playerStarts ?? []).filter(s=>s.player===this.me+1));
    this.mini.setFog(this.world.settlement!.view(this.me));
    renderer.draw(this.world.view(this.me), this.stamps);
    this.mini?.paint();
    this.bridge = new EditorBridge({
      dispatch: async (op, params) => {
        const o = (params ?? {}) as Record<string, unknown>;
        if (op === "gameStatus")
          return {
            map: match.mapId,
            revision: match.mapRevision,
            player: this.me,
            tick: this.world!.clock.tickIndex,
            checksum: this.world!.checksum(),
            settlement: this.world!.settlement!.view(this.me),
            desynced: this.desynced,
          };
        if (op === "gameCommand") {
          if (!validAction(o.action))
            throw new Error("Invalid gameplay action");
          this.send(o.action);
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
    const simulation=perf.start();
    const remote = this.config.channel != null;
    if (remote && !this.desynced) this.pulseConfirm();
    this.acc += dtMs;
    const step = world.clock.tickMs;
    const cap = remote ? 2 : 8;
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
      world.tick();
      const ch = this.config.channel;
      if (ch && next % matchChecksumEvery(this.match) === 0) {
        ch.send({ type: "hash", tick: next, checksum: world.checksum() });
      }
      n++;
    }
    if (n >= cap && !remote) this.acc = 0;
    perf.end('Simulation / lockstep',simulation);
    const input=perf.start();
    this.input?.tick(dtMs);
    perf.end('Input',input);
    const snapshot=perf.start();
    const view = world.view(this.me);
    perf.end('View snapshot',snapshot);
    const hud=perf.start();
    if (view.settlement) {
      if (view.settlement.revision !== this.resourceRevision) {
        this.resourceRevision = view.settlement.revision;
        const removed = new Set(
          view.settlement.resources
            .filter((n) => n.amount === 0)
            .map((n) => n.stampId),
        );
        const nextStamps = this.loadedMap!.map.stamps.filter((s) => !removed.has(s.id));
        // Economy revisions also change for worker movement. Preserve scenery
        // identity until an actual resource disappears, avoiding GPU rebatches.
        if(nextStamps.length!==this.stamps.length||nextStamps.some((stamp,i)=>stamp!==this.stamps[i])){
          this.stamps=nextStamps;
          this.mini?.setStamps(this.stamps);
        }
      }
      this.mini?.setFog(view.settlement);
      this.economyHud?.update(view.settlement);
      renderer.gameSelect(this.economyHud?.selected ?? null);
    }
    perf.end('Economy HUD / minimap data',hud);
    renderer.draw(view, this.stamps);
    const minimap=perf.start();
    this.mini?.paint();
    perf.end('Minimap paint',minimap);
    this.fpsFrames += 1;
    this.fpsMs += dtMs;
    if (this.fpsMs >= 1000) {
      this.fps = Math.round((this.fpsFrames * 1000) / this.fpsMs);
      this.fpsFrames = 0;
      this.fpsMs = 0;
    }
    this.config.hooks.onHud({ fps: this.fps, zoom: renderer.camera.distance });
  }

  private send(action: Action) {
    this.locksteps.get(this.me)?.send(action);
  }
  private click(clientX: number, clientY: number) {
    const sim = this.world?.settlement,
      hit = this.renderer?.pickGround(clientX, clientY),
      hud = this.economyHud;
    if (!sim || !hit || !hud) return;
    const x = Math.round(hit.x),
      z = Math.round(hit.z);
    if(hud.rallyMode && hud.selected){this.send({type:'rally',id:hud.selected,x,z});hud.rallyMode=false;return;}
    if (hud.mode) {
      const error = sim.canBuild(this.me, hud.mode, x, z);
      if (error) {
        hud.placement(error);
        return;
      }
      this.send({ type: "build", kind: hud.mode, x, z });
      return;
    }
    const picked = this.renderer?.pickGameEntity(clientX, clientY);
    const attacker=sim.workers.find(w=>w.id===hud.selected && w.owner===this.me && isSoldier(w.role));
    const issueAttack=(id:number)=>{
      const target=sim.workers.find(w=>w.id===id)??sim.buildings.find(b=>b.id===id);
      if(attacker && target && target.owner!==this.me && target.health>0){this.send({type:'attack',id:attacker.id,target:id});return true;}return false;
    };
    if (picked != null) {
      if(issueAttack(picked))return;
      hud.selected = picked;
      return;
    }
    const known = sim.view(this.me);
    const building = known.buildings.find(
      (b) =>
        Math.abs(b.x - hit.x) <= BUILDINGS[b.kind].radius &&
        Math.abs(b.z - hit.z) <= BUILDINGS[b.kind].radius,
    );
    const worker = known.workers.find(
      (w) => Math.abs(w.x - hit.x) + Math.abs(w.z - hit.z) < 1.6,
    );
    if (building || worker) {
      if(issueAttack((building??worker)!.id))return;
      hud.selected = (building ?? worker)!.id;
      return;
    }
    const selected = sim.workers.find(
      (w) =>
        w.id === hud.selected && w.owner === this.me && (w.role === "carrier" || isSoldier(w.role)) && !w.shipment && !w.quantity,
    );
    if (selected) this.send({ type: "move-worker", id: selected.id, x, z });
    else hud.selected = null;
  }

  stop(): void {
    if (this.confirmTimer != null) clearInterval(this.confirmTimer);
    this.confirmTimer = null;
    this.canvas.removeEventListener("pointermove", this.onHover);
    window.removeEventListener("keydown", this.onKey);
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
    const room = new Room(match);
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
