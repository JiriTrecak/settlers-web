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

  constructor(
    canvas: HTMLCanvasElement,
    hooks: {
      onLeave: () => void;
      mapId: string;
      player: number;
      channel?: Channel;
      match?: MatchConfig;
    },
  ) {
    super("screen");
    this.mapId = hooks.mapId;
    this.hud = new Hud(this.root, { onLeave: hooks.onLeave });
    this.session = new Session(canvas, {
      player: hooks.player,
      channel: hooks.channel,
      match: hooks.match,
      hooks: { onHud: (state) => this.hud.update(state) },
    });
  }

  start(): void {
    this.session.start();
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
