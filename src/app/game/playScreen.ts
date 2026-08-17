/**
 * In-match screen: HUD + session, all under one root. Destroy stops the session.
 */
import type { Application } from "pixi.js";
import { Hud, GameScreen } from "../../ui";
import { Session, type MapCatalogEntry } from "../../session";

export class PlayScreen extends GameScreen {
  readonly mapId: string;
  private readonly hud: Hud;
  private readonly session: Session;

  constructor(
    pixi: Application,
    catalog: readonly MapCatalogEntry[],
    mapId: string,
    hooks: { onLeave: () => void; player: number },
  ) {
    super("screen");
    this.mapId = mapId;
    this.hud = new Hud(this.root, {
      onLeave: hooks.onLeave,
      onShowPaths: (on) => this.session.setShowPaths(on),
    });
    this.session = new Session(pixi, this.root, {
      mapId,
      catalog,
      player: hooks.player,
      hooks: {
        onHud: (state) => this.hud.update(state),
        onLeave: hooks.onLeave,
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
