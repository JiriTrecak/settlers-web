/**
 * In-match screen: HUD + session, all under one root. Destroy stops the session.
 */
import type { Application } from "pixi.js";
import { Hud, GameScreen } from "../../ui";
import { Session, type MapCatalogEntry, type ReplayFile } from "../../session";

export class PlayScreen extends GameScreen {
  readonly mapId: string;
  readonly replayId: string | null;
  private readonly hud: Hud;
  private readonly session: Session;

  constructor(
    pixi: Application,
    catalog: readonly MapCatalogEntry[],
    mapId: string,
    hooks: {
      onLeave: () => void;
      player: number;
      replay?: ReplayFile;
      onReplay?: (file: ReplayFile) => void;
    },
  ) {
    super("screen");
    this.mapId = mapId;
    this.replayId = hooks.replay?.id ?? null;
    this.hud = new Hud(this.root, {
      onLeave: hooks.onLeave,
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
      replay: hooks.replay,
      hooks: {
        onHud: (state) => this.hud.update(state),
        onClaiming: (on) => this.hud.setClaiming(on, false),
        onReplay: hooks.onReplay,
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
