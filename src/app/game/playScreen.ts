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

  constructor(
    canvas: HTMLCanvasElement,
    hooks: {
      onLeave: () => void;
      mapId: string;
      player: number | null;
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
    this.root.classList.toggle("observer-match", hooks.player === null);
    this.session = new Session(canvas, {
      player: hooks.player,
      mapId: hooks.mapId,
      host: this.root,
      channel: hooks.channel,
      match: hooks.match,
      hooks: { onHud: (state) => this.hud.update(state) },
    });
    this.loading = new LoadingScreen(this.root, hooks.onLeave);
  }

  start(): void {
    void this.session.start(p => this.loading.update(p)).then(() => {
      if (!this.destroyed) this.loading.destroy();
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
    this.session.stop();
    this.hud.destroy();
    super.destroy();
  }
}
