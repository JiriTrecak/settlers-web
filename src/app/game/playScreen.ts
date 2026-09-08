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
    this.hud = new Hud(this.root, {
      onLeave: hooks.onLeave,
      ...(!hooks.channel
        ? {
            onSave: () => {
              const data = this.session.snapshotLocal(),
                url = URL.createObjectURL(
                  new Blob([JSON.stringify(data)], {
                    type: "application/json",
                  }),
                ),
                a = document.createElement("a");
              a.href = url;
              a.download = `${this.mapId}.utcsave`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            },
            onLoad: async (file: File) => {
              try {
                this.session.restoreLocal(JSON.parse(await file.text()));
              } catch (e) {
                const dialog = document.createElement("dialog");
                dialog.className = "canopy-settings";
                const text = document.createElement("p");
                text.textContent = (e as Error).message;
                const close = document.createElement("button");
                close.textContent = "Close";
                close.onclick = () => {
                  dialog.close();
                  dialog.remove();
                };
                dialog.append(text, close);
                this.root.append(dialog);
                dialog.showModal();
              }
            },
          }
        : {}),
    });
    this.session = new Session(canvas, {
      player: hooks.player,
      mapId: hooks.mapId,
      host: this.root,
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
