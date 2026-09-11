import {GameMenu} from '../../ui/menu/gameMenu';
import {getMap} from '../../shared/map/library';
import type {LocalSave} from '../../shared/save/localSave';
import {LoadingScreen} from '../../ui/loadingScreen';
/**
 * In-match screen: HUD + session. Destroy stops the session.
 */
import { Hud, GameScreen } from "../../ui";
import { Session } from "../../session";
import type { Channel } from "../../net";
import type { MatchConfig } from "../../shared";

export class PlayScreen extends GameScreen {
  readonly mapId: string;
  private readonly hud: Hud;
  private readonly session: Session;
  private readonly loading: LoadingScreen;
  private destroyed = false;
  private ready = false;
  private readonly menu:GameMenu;
  private readonly initialSave?:LocalSave;

  constructor(
    canvas: HTMLCanvasElement,
    hooks: {
      onLeave: () => void;
      onRestart?:()=>void;
      onLoadSave?:(save:LocalSave)=>void;
      save?:LocalSave;
      mapId: string;
      player: number | null;
      channel?: Channel;
      match?: MatchConfig;
    },
  ) {
    super("screen");
    this.mapId = hooks.mapId;
    this.initialSave=hooks.save;
    const entry=getMap(hooks.mapId);
    this.menu=new GameMenu(entry.map.mission?'campaign':'skirmish',entry.name,{
      pause:p=>this.session?.setMenuPaused(p),leave:hooks.onLeave,
      ...(!hooks.channel?{snapshot:()=>this.session.snapshotLocal(),restart:hooks.onRestart,load:hooks.onLoadSave}:{}),
    });
    this.hud = new Hud(this.root,{onLeave:hooks.onLeave,onMenu:()=>{if(this.ready)this.menu.open();}});
    this.root.classList.toggle("observer-match", hooks.player === null);
    this.session = new Session(canvas, {
      player: hooks.player,
      mapId: hooks.mapId,
      host: this.root,
      channel: hooks.channel,
      match: hooks.match,
      hooks: { onMissionLeave: hooks.onLeave, onHud: (state) => this.hud.update(state) },
    });
    this.loading = new LoadingScreen(this.root, hooks.onLeave);
  }

  start(): void {
    void this.session.start(p => this.loading.update(p)).then(() => {
      if (!this.destroyed) {if(this.initialSave)this.session.restoreLocal(this.initialSave);this.ready=true;this.loading.destroy();}
    }).catch(error => {
      if (!this.destroyed) {this.session.stop();this.loading.error(error);console.error(error);}
    });
  }

  override tick(dtMs: number, nowMs: number): void {
    this.session.tick(dtMs, nowMs);
  }

  override destroy(): void {
    this.destroyed = true;
    this.loading.destroy();
    this.menu.destroy();
    this.session.stop();
    this.hud.destroy();
    super.destroy();
  }
}
