import {UNIT_CAMERA_MODES,nextCameraMode,type UnitCameraMode} from '../../shared/camera/modes';
import type {CampaignCompany} from '../../shared/scenario/company';
import {MissionHud} from "../../ui/campaign/missionHud";
import {createMissionMatch} from "../../shared/scenario/match";
import {preloadCommandArt} from '../../ui/settlement/commandArt';
import type {LoadProgress} from '../../shared/loading';
import {AssetLoading,loadingPaint} from '../../render/loading/assetLoading';
import { GameChat } from "../../ui/chat/chat";
import { commandFeedback } from "../../presentation/commandFeedback";
import { ObserverPanel } from "../../ui/observer/observerPanel";
import { matchSpeed } from "./presentationView";
import {SimulationClient} from "../worker/client";
import type {RuntimeFrame} from "../worker/runtime";
import type {LocalSave} from "../../shared/save/localSave";
import { createSkirmishMatch, defaultSlots } from "../../shared/match/skirmish";
import { areaSelection } from "../../presentation/commands";
import { resourceStamps, ResourceScenery } from "../../presentation/scenery";
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
import type {Channel} from "../../net";
import { MapInput, Minimap, Renderer } from "../../render";
import type { HudState } from "../../ui";

export type SessionHooks = {
  onHud: (state: HudState) => void;
  onMissionLeave?:()=>void;
  onMissionContinue?:(mapId:string,company:CampaignCompany)=>void;
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
  private unitCameraMode:UnitCameraMode='rts';
  private cinematicFocus:{x:number;z:number}|null=null;
  private chat: GameChat | null = null;
  private loadedMap: MapEntry | null = null;
  private worker: SimulationClient | null = null;
  private renderer: Renderer | null = null;
  private input: MapInput | null = null;
  private mini: Minimap | null = null;
  private menuPaused = false;
  setMenuPaused(paused:boolean):void {if(this.config.channel)return;this.menuPaused=paused;this.input?.reset();const worker=this.worker;void worker?.request("pause",paused).catch(error=>{if(worker===this.worker)this.workerError(error);});}
  private fps = 60;
  private fpsFrames = 0;
  private fpsMs = 0;
  private desynced = false;
  /** Transport mailbox, not authority. An observer borrows an empty local mailbox. */
  private readonly me: number;
  private reveal = false;
  private speed = 1;
  private visionPlayer: number;
  private observerPanel: ObserverPanel | null = null;
  private observerStatsTick = -1;
  private unbindDebug: (() => void) | null = null;
  private get observing(): boolean {
    return this.config.player === null;
  }
  private get simulationSpeed(): number {
    return matchSpeed(this.speed, !!this.config.channel);
  }
  private visualView() {return this.worker!.latest!.visual;}
  private selectionView() {return this.worker!.latest!.selection.settlement;}
  private workerProfiling=false;
  private configureWorker(){const worker=this.worker;void worker?.request('configure',{speed:this.simulationSpeed,reveal:this.reveal,visionPlayer:this.visionPlayer,profiling:perf.enabled}).catch(error=>{if(worker===this.worker)this.workerError(error);});}
  private workerError(error:unknown){console.error(error);this.economyHud?.showError(`Simulation stopped: ${error instanceof Error?error.message:String(error)}`);}
  private acceptFrame(frame:RuntimeFrame){
    this.desynced=frame.desynced;
    for(const [name,ms] of frame.profileSamples)perf.sample(name,ms);
    for(const [name,ms] of Object.entries(frame.timings))if(name!=='simulation')perf.sample(`Worker · ${name}`,ms);
    if(perf.enabled){
      perf.value('Navigation searches (match)',frame.routing.searches);
      perf.value('Navigation cells expanded (match)',frame.routing.expanded);
      perf.value('Navigation sector regions expanded (match)',frame.routing.coarseExpanded);
      perf.value('Navigation corridor fallbacks (match)',frame.routing.fallbacks);
      perf.value('Worker profiling samples dropped',frame.droppedSamples);
    }
    if(frame.observer&&frame.observer.tick!==this.observerStatsTick){this.observerStatsTick=frame.observer.tick;this.observerPanel?.update(frame.observer);}
    if(this.economyHud?.mode&&this.placementPointer){this.placementResult=undefined;this.onHover(this.placementPointer);}
  }
  private explored(x:number,y:number){const view=this.selectionView(),size=this.visualView().size;return x>=0&&y>=0&&x<size&&y<size&&!!view.fog?.cells[y*size+x];}

  private bridge: EditorBridge | null = null;
  private terrain = new HeightField();
  private stamps: readonly MapStamp[] = [];
  private resourceScenery = new ResourceScenery();
  private resourceMapStamps: readonly MapStamp[] | undefined;
  private resourceStampsView: readonly MapStamp[] | undefined;
  private resourceEntities: Parameters<typeof resourceStamps>[0] | undefined;
  private updateResourceStamps(entities: Parameters<typeof resourceStamps>[0]) {
    // Observation owns immutable per-update arrays. Reuse them between simulation
    // ticks, but never key by tick alone: reveal/restore can change the same tick.
    const mapStamps=this.loadedMap!.map.stamps;
    if (this.resourceEntities === entities && this.resourceMapStamps===mapStamps) return;
    this.resourceEntities = entities;
    const resources = this.resourceScenery.project(entities);
    if (resources === this.resourceStampsView && this.resourceMapStamps===mapStamps) return;
    this.resourceStampsView = resources;this.resourceMapStamps=mapStamps;
    this.stamps = [...mapStamps, ...resources];
    this.mini?.setStamps(this.stamps);
  }
  private missionHud: MissionHud | null = null;
  private economyHud: SettlementHud | null = null;
  private placementPointer: { clientX: number; clientY: number } | null = null;
  private readonly onHover = (e: { clientX: number; clientY: number }) => {
    this.placementPointer = { clientX: e.clientX, clientY: e.clientY };
    const hit = this.economyHud?.mode ? this.renderer?.pickGround(e.clientX,e.clientY) : this.renderer?.pickWalk(e.clientX,e.clientY),
      kind = this.economyHud?.mode;
    const binding = this.economyHud?.targeting,
      sim = this.worker?.latest?.selection.settlement;
    const caster =
      binding?.type === "cast" ? sim?.entities.find(e=>e.id===binding.actors[0]) : null;
    const spell = binding?.ability
      ? content.rules.spells[binding.ability]
      : null;
    const rank = binding?.ability
      ? caster?.spellcasting?.learned[binding.ability]
      : 0;
    if (hit && caster && spell && rank) {
      const origin = caster,
        point = { x: Math.round(hit.x), y: Math.round(hit.z), ...("surface" in hit&&typeof hit.surface==="string"?{surface:hit.surface}:{}) };
      const valid =
        Math.hypot(point.x - origin.x, point.y - origin.y) <=
          spell.ranks[rank - 1].range &&
        this.explored(point.x,point.y);
      this.renderer?.gameAbilityTarget({ spell, rank, origin, point, valid });
    } else this.renderer?.gameAbilityTarget(null);
    if (!hit || !kind) {
      this.placementLatest=undefined;
      this.renderer?.gamePreview(null);
      return;
    }
    const x=Math.round(hit.x),z=Math.round(hit.z),rotation=this.economyHud?.placementRotation??0;
    const query={definition:kind,position:{x,y:z},actor:this.economyHud?.buildingActor,rotation};
    const key=JSON.stringify(query);
    this.placementLatest={key,query};
    // Display the cursor immediately; authoritative placement validation arrives
    // asynchronously, with at most one query in flight and stale results ignored.
    this.renderer?.gamePreview(kind,x,z,this.placementResult?.key===key&&!this.placementResult.error,rotation,this.me);
    this.pumpPlacement();
  };
  private placementLatest:{key:string;query:{definition:string;position:{x:number;y:number};actor?:number;rotation:number}}|undefined;
  private placementResult:{key:string;error:string|null}|undefined;
  private placementBusy=false;
  private pumpPlacement(){
    const pending=this.placementLatest,worker=this.worker;
    if(!pending||!worker||this.placementBusy||this.placementResult?.key===pending.key)return;
    this.placementBusy=true;
    void worker.request('placement',pending.query).then(error=>{
      if(worker!==this.worker)return;
      if(this.placementLatest?.key===pending.key&&this.economyHud?.mode===pending.query.definition){
        this.placementResult={key:pending.key,error};
        this.renderer?.gamePreview(pending.query.definition,pending.query.position.x,pending.query.position.y,!error,pending.query.rotation,this.me);
        this.economyHud?.placement(error);
      }
    }).catch(error=>{if(worker===this.worker)this.workerError(error);}).finally(()=>{this.placementBusy=false;if(worker===this.worker&&this.placementLatest?.key!==pending.key)this.pumpPlacement();});
  }

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

  private started = false;
  private loadGeneration = 0;
  private assetLoading: AssetLoading | null = null;

  async start(report: (progress: LoadProgress) => void = () => {}): Promise<void> {
    const generation = ++this.loadGeneration;
    const check = () => {if (generation !== this.loadGeneration) throw new DOMException("Match loading cancelled", "AbortError");};
    const loaded = (this.loadedMap = getMap(
      this.config.match?.mapId ?? this.config.mapId,
    ));
    const map = requirePlayableMap(loaded.map);
    this.reveal = this.observing || !!map.sandbox;
    const match =
      this.config.match ??
      (map.mission ? createMissionMatch(loaded.id,map,loaded.revision) : createSkirmishMatch(
        {
          mapId: loaded.id,
          slots: defaultSlots(map.playerStarts, this.config.player),
        },
        map.playerStarts,
        loaded.revision,
        "", 1, !!map.sandbox,
      ).match);
    this.chat?.destroy();
    this.chat = new GameChat(this.config.host, text => {
      if (this.config.channel) this.config.channel.send({type: "chat", text});
      else this.chat?.receive({text, player: this.observing ? null : this.me,
        name: this.observing ? "Observer" : match.slots.find(s => s.player === this.me)?.name ?? `Player ${this.me + 1}`});
    });
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
    report({stage:"Preparing simulation and terrain"});
    await loadingPaint(); check();
    const worker=this.worker=new SimulationClient({
      frame:frame=>this.acceptFrame(frame),chat:message=>this.chat?.receive(message),
      learned:()=>this.economyHud?.learnedAbility(),error:error=>{this.desynced=true;this.workerError(error);},sample:(name,ms)=>perf.sample(name,ms),
    },this.config.channel);
    const initial=await worker.request('init',{map,match,player:this.config.player,remote:!!this.config.channel});check();
    if(this.observing){this.observerPanel=new ObserverPanel(this.config.host);if(worker.latest?.observer)this.observerPanel.update(worker.latest.observer);}
    const catalog = projectCatalogue(),
      urls = new Map(
        catalog.assets.flatMap((a) => {
          const url = projectMeshUrl(a.file);
          return url ? [[a.id, url] as [string, string]] : [];
        }),
      );
    report({stage:"Loading models and textures"});
    await loadingPaint(); check();
    const assets = this.assetLoading = new AssetLoading(report);
    const renderer = this.renderer = new Renderer(this.canvas, urls);
    renderer.setKinds(new Map(catalog.assets.map((a) => [a.id, a.type])));
    this.terrain = new HeightField(map.size);
    this.terrain.load(
      map.height ? decodeHeight(map.height, map.size)! : [],
      map.waterLevel ?? 0,
    );
    renderer.setTerrain(this.terrain);
    renderer.setLandscape(map.landscape ?? emptyLandscape());
    renderer.sky.setPlaying(false);
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
      onClick: (x, y, shift, sameType) => this.click(x, y, shift, false, sameType),
      onRightClick: (x, y, shift) => this.click(x, y, shift, true),
      onSelectArea: (rect, shift) => {
        const hud = this.economyHud,
          state = this.worker?.latest ? this.selectionView() : undefined;
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
      cameraMode:()=>this.unitCameraMode,
      cycleCamera:()=>{this.unitCameraMode=nextCameraMode(this.unitCameraMode);},
      resetCamera:()=>{this.unitCameraMode='rts';renderer.unitCamera(null);},
      portrait: (host,definition,owner)=>renderer.gamePortrait(host,definition,owner),
      mode: () => {
        if (this.placementPointer) this.onHover(this.placementPointer);
        else {
          renderer.gamePreview(null);
          renderer.gameAbilityTarget(null);
        }
      },
      lookAt:(x,y)=>{this.unitCameraMode='rts';renderer.unitCamera(null);renderer.camera.lookAt(x,y);this.present();},
      focus: (id, group) => {
        const visible=this.selectionView().entities.filter(e=>(group??[id]).includes(e.id)&&!e.unit?.contained&&!e.remembered);
        if(!visible.length)return;
        renderer.camera.lookAt(visible.reduce((n,e)=>n+e.x,0)/visible.length,visible.reduce((n,e)=>n+e.y,0)/visible.length);
        this.present();
      },
      home: () => {
        const game = this.worker?.latest?.selection.settlement,
          home = game?.entities.find(e=>e.id===game.objectives[slotOwner(this.me)]);
        if (home) renderer.camera.lookAt(home.x, home.y);
      },
    });
    if(map.mission) this.missionHud=new MissionHud(this.config.host,()=>this.config.hooks.onMissionLeave?.(),map.mission,
      !this.config.channel&&map.mission.nextMission&&this.config.hooks.onMissionContinue?()=>{
        void worker.request('company',undefined).then(company=>{if(worker===this.worker)this.config.hooks.onMissionContinue!(map.mission!.nextMission!,company);}).catch(error=>this.workerError(error));
      }:undefined);
    this.canvas.addEventListener("pointermove", this.onHover);
    this.mini = new Minimap(this.config.host, {
      camera: renderer.camera,
      clock: () => renderer.sky.snapshot(),
      viewport: () => ({
        w: this.canvas.clientWidth,
        h: this.canvas.clientHeight,
      }),
      onOrder:(x,y,right,shift)=>{
        const hud=this.economyHud;if(!hud||this.observing)return false;
        const binding=hud.targeting,destination={x:Math.floor(x),y:Math.floor(y)};
        if(right&&binding){hud.clearMode();return true;}
        if(!right&&!binding)return false;
        if(binding?.type==='rally'){this.send({type:'rally',actor:binding.actors[0],destination});hud.clearMode();return true;}
        if(binding&&!['move','attack','patrol'].includes(binding.type))return true;
        const actors=binding?.actors??this.selectionView().entities.filter(e=>hud.selectedIds.includes(e.id)&&e.owner===slotOwner(this.me)&&e.unit&&!e.unit.contained&&content.get(e.definition).behaviors.playerControl).map(e=>e.id);
        if(actors.length)this.send(binding?.type==='patrol'?{type:'patrol',actors,destination,...(shift?{append:true}:{})}:{type:'move',actors,destination,attackMove:binding?.type==='attack',...(shift?{append:true}:{})});
        if(binding)hud.clearMode();return true;
      },
      onLookAt: (x, z) => {
        renderer.camera.lookAt(x, z);
        this.present();
      },
    });
    this.mini.mountGame(this.economyHud.minimapHost, this.economyHud.clockHost);
    this.mini.setHeight(this.terrain);
    this.mini.setLandscape(map.landscape);
    this.mini.setStamps(this.stamps);
    // Spawn-number badges belong to the editor; gameplay shows real footprints.
    const initialView = this.visualView();
    this.mini.setFog(initialView.settlement!);
    this.economyHud.update(this.selectionView());
    if(map.mission || map.sandbox)this.economyHud.setSelection(initialView.settlement.entities.filter(e=>e.owner===slotOwner(this.me)&&e.unit).map(e=>e.id));
    renderer.draw(initialView, this.stamps);
    // Include scenery variants outside current fog, without revealing entities.
    await Promise.all([renderer.preload([...map.stamps, ...resourceStamps(initial.resources)]), preloadCommandArt(), document.fonts.ready]); check();
    await assets.ready(); check();
    report({stage:"Preparing graphics and shaders"});
    await loadingPaint(); check();
    renderer.draw(initialView, this.stamps);
    await renderer.warmup(); check();
    await assets.ready(); check();
    renderer.present();
    assets.close(); this.assetLoading = null;
    renderer.sky.setPlaying(!map.sandbox && !map.landscape?.environment.interior);
    this.started = true;
    await worker.request("start",undefined);check();
    this.unbindDebug = perf.bindMatch({
      reveal: this.reveal,
      speed: this.simulationSpeed,
      remote: !!this.config.channel,
      visionPlayer: this.visionPlayer,
      players: match.slots,
      onReveal: (value) => {
        if (!this.config.channel) {
          this.reveal = value;this.configureWorker();
          this.resourceEntities = undefined;
        }
      },
      onSpeed: (value) => {
        this.speed = matchSpeed(value, !!this.config.channel);this.configureWorker();
        renderer.gameTimeScale = this.simulationSpeed;
      },
      onVision: (player) => {
        if (
          !this.config.channel &&
          match.slots.some((s) => s.player === player)
        ) {
          this.visionPlayer = player;this.configureWorker();
          this.resourceEntities = undefined;
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
            cameraMode:this.unitCameraMode,
            speed: this.simulationSpeed,
            reveal: this.reveal,
            ...await worker.request('status',undefined),
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
        if (op === "gamePerformance") return {timings:perf.report(),renderer:renderer.diagnostics(),tick:worker.latest!.tick};
        if (op === "gameSave") return this.snapshotLocal();
        if (op === "gameLoad") {
          await this.restoreLocal(o.save);
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
          if(o.cameraMode!==undefined){
            if(!UNIT_CAMERA_MODES.includes(o.cameraMode as UnitCameraMode))throw new Error('Invalid camera mode');
            const id=typeof o.subject==='number'?o.subject:this.economyHud?.selectedIds[0];
            const subject=this.selectionView().entities.find(e=>e.id===id);
            if(o.cameraMode!=='rts'&&(!subject?.unit||subject.remembered||subject.unit.contained||(subject.hp!==null&&subject.hp<=0)))throw new Error('Camera requires a visible living unit');
            if(o.subject!==undefined&&subject)this.economyHud?.setSelection([subject.id]);
            this.unitCameraMode=o.cameraMode as UnitCameraMode;
            if(this.unitCameraMode==='rts')renderer.unitCamera(null);
          }else if(o.x!==undefined||o.z!==undefined){this.unitCameraMode='rts';renderer.unitCamera(null);}

          if (typeof o.x === "number" && typeof o.z === "number")
            renderer.camera.lookAt(o.x, o.z);
          if (typeof o.gameZoom === "number")
            renderer.camera.pose({ gameZoom: o.gameZoom });
          this.present();
          return { x: renderer.camera.targetX, z: renderer.camera.targetZ, cameraMode:this.unitCameraMode };
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
    const worker=this.worker;
    if(!this.started||!renderer||!worker?.latest)return;
    if(this.workerProfiling!==perf.enabled){this.workerProfiling=perf.enabled;this.configureWorker();}
    if(perf.enabled)perf.value('Worker snapshot age (ms)',performance.now()-worker.receivedAt);
    // Keep the authoritative match and network running in a hidden tab, but
    // defer snapshots, DOM, animation, minimap and GPU work until it is visible.
    // This also prevents a stale edge-hover from moving an unseen camera.
    if (document.hidden) {
      this.fpsFrames = 0;
      this.fpsMs = 0;
      return;
    }
    const input = perf.start();
    const state=worker.latest.visual.settlement,scene=state.mission?.scene;
    const cinematic=(!state.outcome&&!state.mission?.error) && (!!scene || !!state.mission?.dialogue?.remaining);
    if(cinematic&&!this.cinematicFocus)this.cinematicFocus={x:renderer.camera.targetX,z:renderer.camera.targetZ};
    if(!cinematic&&this.cinematicFocus){renderer.unitCamera(null);renderer.camera.lookAt(this.cinematicFocus.x,this.cinematicFocus.z);this.cinematicFocus=null;}
    if(cinematic || this.menuPaused)this.input?.reset();else this.input?.tick(dtMs);
    renderer.camera.cinematic(cinematic,dtMs);
    perf.end("Input", input);
    const snapshot = perf.start();
    const view = this.visualView();
    perf.end("View snapshot", snapshot);
    const hud = perf.start();
    if (view.settlement) {
      this.updateResourceStamps(view.settlement.entities);
      this.mini?.setFog(view.settlement);
      this.economyHud?.update(this.selectionView());
      this.missionHud?.update(view.settlement);
      renderer.gameSelect(cinematic ? [] : this.economyHud?.selectedIds ?? []);
      this.canvas.style.cursor = this.economyHud?.attackMode
        ? "crosshair"
        : "default";
    }
    perf.end("Economy HUD / minimap data", hud);
    if (this.economyHud?.targeting?.type === "cast" && this.placementPointer)
      this.onHover(this.placementPointer);
    const focus=view.settlement?.entities.find(e=>e.id===this.economyHud?.selectedIds[0]);
    if(!focus?.unit||focus.remembered||focus.unit.contained||(focus.hp!==null&&focus.hp<=0))this.unitCameraMode='rts';
    const shot=cinematic?scene?.camera:undefined;
    if(shot&&shot.mode!=='rts'){
      const entity=worker.latest.targets.find(e=>e.tag===shot.entity),target=worker.latest.targets.find(e=>e.tag===shot.lookAt);
      renderer.unitCamera(entity?{...shot,mode:shot.mode,entity:entity.id,lookAt:target?.id}:null);
    }else if(!cinematic&&this.unitCameraMode!=='rts'&&focus){renderer.unitCamera({mode:this.unitCameraMode,entity:focus.id});}
    else {renderer.unitCamera(null);if(cinematic&&scene){const target=shot&&worker.latest.targets.find(e=>e.tag===shot.entity);renderer.camera.lookAt(target?.x??scene.x,target?.y??scene.y);}}
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

  async snapshotLocal():Promise<LocalSave>{
    if(!this.worker||this.config.channel)throw Error('Local saves require a singleplayer match');
    const controls=this.economyHud?.saveControls(),save=await this.worker.request('save',undefined);
    return {...save,controlGroups:controls};
  }
  async restoreLocal(raw:unknown){
    if(!this.worker||this.config.channel)throw Error('Local load requires a singleplayer match');
    const worker=this.worker;await worker.load(raw);if(worker!==this.worker)return;
    this.unitCameraMode='rts';this.cinematicFocus=null;this.renderer?.unitCamera(null);
    this.resourceEntities=undefined;this.placementResult=undefined;
    this.economyHud?.restoreControls((raw as LocalSave).controlGroups);
  }
  private send(action:Action):boolean{
    if(this.observing||this.desynced||!this.worker?.latest)return false;
    if(!this.worker.send(action))return false;
    const feedback=commandFeedback(action,this.selectionView(),content);
    if(feedback)this.renderer?.gameCommandFeedback(feedback);
    return true;
  }
  private click(
    clientX: number,
    clientY: number,
    shift = false,
    right = false,
    sameType = false,
  ) {
    const sim = this.worker?.latest?.selection.settlement,
      hit = this.economyHud?.mode ? this.renderer?.pickGround(clientX,clientY) : this.renderer?.pickWalk(clientX, clientY),
      hud = this.economyHud;
    if (right && hud?.targeting) {
      hud.clearMode();
      return;
    }
    if (!sim || !hit || !hud) return;
    const x = Math.round(hit.x),
      z = Math.round(hit.z);
    const owner = slotOwner(this.me),
      position = { x, y: z, ...("surface" in hit && typeof hit.surface==="string"?{surface:hit.surface}:{}) },
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
      const key=JSON.stringify({definition:hud.mode,position,actor:hud.buildingActor,rotation:hud.placementRotation});
      const error=this.placementResult?.key===key?this.placementResult.error:null;
      if(error){hud.showError(error);hud.placement(error);return;}
      const action: Extract<Action, { type: "build" }> = {
        type: "build",
        actors: hud.targeting!.actors,
        definition: hud.mode,
        position,
        rotation: hud.placementRotation,
        ...(shift ? {append: true} : {}),
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
    let target =
      selectable.find((e) => e.id === picked) ??
      selectable.find((e) => {
        const d = content.get(e.definition),
          r = d.footprint
            ? Math.max(d.footprint.width, d.footprint.depth) / 2
            : 0.8;
        return Math.abs(e.x - hit.x) <= r && Math.abs(e.y - hit.z) <= r;
      });
    // An enemy on a lookout is protected by the tower. Clicking its visible
    // silhouette attacks that structure; friendly occupants remain selectable.
    if(target?.unit?.garrison&&target.owner!==owner&&(right||hud.attackMode))
      target=known.entities.find(e=>e.id===target!.unit!.garrison!.building)??target;
    if(!right&&!binding&&sameType&&target&&target.owner===owner&&target.unit){
      const screen=new Set(this.renderer!.unitsInScreenRect(selectable.filter(e=>e.unit),{left:0,top:0,right:innerWidth,bottom:innerHeight}));
      const ids=selectable.filter(e=>e.definition===target.definition&&e.owner===owner&&screen.has(e.id)).map(e=>e.id);
      hud.setSelection(shift?[...new Set([...hud.selectedIds,...ids])]:ids);return;
    }
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
          ...(shift ? {append: true} : {}),
        });
      else
        this.send({
          type: "move",
          actors: binding!.actors,
          destination: position,
          attackMove: true,
          ...(shift ? {append: true} : {}),
        });
      hud.clearMode();
      return;
    }
    if (binding?.type === "cast" && binding.ability) {
      const caster = sim.entities.find(e=>e.id===binding.actors[0]),
        spell = content.rules.spells[binding.ability],
        rank = caster?.spellcasting?.learned[binding.ability];
      if (
        !caster ||
        !rank ||
        Math.hypot(
          position.x - caster.x,
          position.y - caster.y,
        ) > spell.ranks[rank - 1].range ||
        !this.explored(position.x,position.y)
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
    if(binding?.type==='follow'){
      if(target)this.send({type:'follow',actors:binding.actors,target:target.id,...(shift?{append:true}:{})});
      hud.clearMode();return;
    }
    if (binding?.type === "move" || binding?.type === "patrol") {
      this.send({
        type: binding.type,
        actors: binding.actors,
        destination: position,
        ...(shift ? {append: true} : {}),
      });
      hud.clearMode();
      return;
    }
    if (target) {
      if(right&&target.owner===owner&&!target.remembered&&content.get(target.definition).garrison){
        const actors=selected.filter(e=>content.get(target.definition).garrison!.accepts.includes(e.definition));
        if(actors.length){this.send({type:'garrison',actors:actors.map(e=>e.id),target:target.id,...(shift?{append:true}:{})});return;}
      }
      if(right&&target.unit&&target.owner===owner&&!target.remembered){const followers=selected.filter(e=>e.id!==target.id);if(followers.length)this.send({type:'follow',actors:followers.map(e=>e.id),target:target.id,...(shift?{append:true}:{})});return;}
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
            ...(shift ? {append: true} : {}),
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
          this.send({ type: "pickup", actor: hero.id, target: target.id, ...(shift ? {append: true} : {}) });
          return;
        }
      }
      if (
        right &&
        army.length &&
        target.owner !== owner &&
        target.owner !== "none" &&
        !target.remembered
      ) {
        this.send({
          type: "attack",
          actors: army.map((e) => e.id),
          target: target.id,
          ...(shift ? {append: true} : {}),
        });
        return;
      }
      if (
        right &&
        army.length &&
        target.owner === "none" &&
        target.unit &&
        !target.remembered
      ) {
        this.send({
          type: "attack",
          actors: army.map((e) => e.id),
          target: target.id,
          ...(shift ? {append: true} : {}),
        });
        return;
      }
      if (right) {
        if (selected.length)
          this.send({
            type: "move",
            actors: selected.map((e) => e.id),
            destination: position,
            ...(shift ? {append: true} : {}),
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
        ...(shift ? {append: true} : {}),
      });
    else if (!right && !shift) hud.selected = null;
  }

  stop(): void {
    this.started = false;
    this.loadGeneration++;
    this.assetLoading?.close();
    this.assetLoading = null;
    this.observerPanel?.destroy();
    this.observerPanel = null;
    this.unbindDebug?.();
    this.unbindDebug = null;
    this.canvas.style.cursor = "";
    this.canvas.removeEventListener("pointermove", this.onHover);
    this.chat?.destroy();
    this.chat = null;
    this.missionHud?.destroy();this.missionHud=null;
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
    this.worker?.stop();this.worker=null;
  }
}
