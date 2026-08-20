/**
 * In-match screen: HUD + session, all under one root. Destroy stops the session.
 */
import type { Application } from "pixi.js";
import { Hud, GameScreen } from "../../ui";
import { Session, type MapCatalogEntry, type ReplayFile, type SaveFile, type SaveStore } from "../../session";
import type { Channel } from "../../net";
import type { MatchConfig } from "../../shared";

export class PlayScreen extends GameScreen {
  readonly mapId: string;
  readonly replayId: string | null;
  readonly saveId: string | null;
  private readonly hud: Hud;
  private readonly session: Session;

  constructor(
    pixi: Application,
    catalog: readonly MapCatalogEntry[],
    mapId: string,
    hooks: {
      onLeave: () => void;
      player: number;
      players?: number;
      replay?: ReplayFile;
      save?: SaveFile;
      saves?: SaveStore;
      host?: boolean;
      channel?: Channel;
      match?: MatchConfig;
      onReplay?: (file: ReplayFile) => void;
      onSave?: (file: SaveFile) => void;
      onLoad?: (file: SaveFile) => void;
      onEnd?: () => void;
      onRestart?: () => void;
    },
  ) {
    super("screen");
    this.mapId = mapId;
    this.replayId = hooks.replay?.id ?? null;
    this.saveId = hooks.save?.id ?? null;
    this.hud = new Hud(this.root, {
      onLeave: hooks.onLeave,
      onSaveReplay: hooks.replay || !hooks.onReplay ? undefined : () => this.session.saveReplay(),
      replay: hooks.replay != null,
      onShowPaths: (on) => this.session.setShowPaths(on),
      onShowOwnership: (on) => this.session.setShowOwnership(on),
      onShowFog: (on) => this.session.setShowFog(on),
      onClaim: (on) => this.session.setClaiming(on),
    });
    this.session = new Session(pixi, this.root, {
      mapId,
      catalog,
      player: hooks.player,
      players: hooks.players,
      replay: hooks.replay,
      save: hooks.save,
      saves: hooks.saves,
      host: hooks.host,
      channel: hooks.channel,
      match: hooks.match,
      hooks: {
        onHud: (state) => this.hud.update(state),
        onClaiming: (on) => this.hud.setClaiming(on, false),
        onReplay: hooks.onReplay,
        onSave: hooks.onSave,
        onLoad: hooks.onLoad,
        onEnd: hooks.onEnd ?? hooks.onLeave,
        onRestart: hooks.onRestart,
      },
    });
  }

  async start(): Promise<void> {
    await this.session.start();
  }

  override tick(dtMs: number, nowMs: number): void {
    this.session.tick(dtMs, nowMs);
  }

  override destroy(): void {
    this.session.stop();
    this.hud.destroy();
    super.destroy();
  }
}
