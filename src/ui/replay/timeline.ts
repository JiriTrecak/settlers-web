/**
 * Bottom-middle playback strip: play/pause, speed, player view, scrubber.
 * Session owns the tick and the viewed slot; this only emits.
 */
import { playerCss } from "../../shared";
import { GAME_SPEEDS, type GameSpeed } from "../speed/speed";

export type ReplayTimelineHooks = {
  onPlay(playing: boolean): void;
  onSeek(tick: number): void;
  onSpeed(speed: GameSpeed): void;
  onPlayer(player: number): void;
};

export class ReplayTimeline {
  private readonly root: HTMLDivElement;
  private readonly play: HTMLButtonElement;
  private readonly time: HTMLSpanElement;
  private readonly playerSelect: HTMLSelectElement | null;
  private readonly scrub: HTMLInputElement;
  private readonly speeds = new Map<GameSpeed, HTMLButtonElement>();
  private dragging = false;
  private duration = 0;
  private tick = 0;
  private playing = false;
  private speed: GameSpeed = 1;
  private player = 0;

  constructor(
    host: HTMLElement,
    hooks: ReplayTimelineHooks,
    opts: { players: readonly number[]; player: number },
  ) {
    this.root = document.createElement("div");
    this.root.className = "hud-replay";
    this.player = opts.player;

    const row = document.createElement("div");
    row.className = "hud-replay-row";

    this.play = document.createElement("button");
    this.play.type = "button";
    this.play.className = "hud-replay-play";
    this.play.addEventListener("click", () => hooks.onPlay(!this.playing));

    this.time = document.createElement("span");
    this.time.className = "hud-replay-time";

    if (opts.players.length >= 2) {
      const select = document.createElement("select");
      select.className = "hud-replay-player";
      select.setAttribute("aria-label", "View as player");
      for (const id of opts.players) {
        const opt = document.createElement("option");
        opt.value = String(id);
        opt.textContent = `Player ${id + 1}`;
        select.append(opt);
      }
      select.value = String(opts.player);
      select.addEventListener("change", () => hooks.onPlayer(Number(select.value) | 0));
      this.playerSelect = select;
    } else {
      this.playerSelect = null;
    }

    const speed = document.createElement("div");
    speed.className = "hud-replay-speeds";
    speed.setAttribute("role", "group");
    speed.setAttribute("aria-label", "Replay speed");
    for (const n of GAME_SPEEDS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = `${n}×`;
      btn.addEventListener("click", () => hooks.onSpeed(n));
      this.speeds.set(n, btn);
      speed.append(btn);
    }

    row.append(this.play, this.time);
    if (this.playerSelect) row.append(this.playerSelect);
    row.append(speed);

    this.scrub = document.createElement("input");
    this.scrub.type = "range";
    this.scrub.className = "hud-replay-scrub";
    this.scrub.min = "0";
    this.scrub.step = "1";
    this.scrub.setAttribute("aria-label", "Replay timeline");
    this.scrub.addEventListener("pointerdown", () => {
      this.dragging = true;
    });
    this.scrub.addEventListener("input", () => {
      this.dragging = true;
      hooks.onSeek(Number(this.scrub.value) | 0);
    });
    const endDrag = (): void => {
      if (!this.dragging) return;
      this.dragging = false;
      hooks.onSeek(Number(this.scrub.value) | 0);
    };
    this.scrub.addEventListener("pointerup", endDrag);
    this.scrub.addEventListener("change", endDrag);

    this.root.append(row, this.scrub);
    host.append(this.root);
    this.sync();
  }

  setPlayback(tick: number, duration: number, playing: boolean, speed: GameSpeed, player: number): void {
    this.tick = tick;
    this.duration = Math.max(0, duration);
    this.playing = playing;
    this.speed = speed;
    this.player = player;
    this.sync();
  }

  destroy(): void {
    this.root.remove();
  }

  private sync(): void {
    this.play.textContent = this.playing ? "Pause" : "Play";
    this.time.textContent = `${formatTime(this.tick)} / ${formatTime(this.duration)}`;
    this.scrub.max = String(this.duration);
    if (!this.dragging) this.scrub.value = String(this.tick);
    for (const [n, btn] of this.speeds) {
      btn.classList.toggle("is-selected", n === this.speed);
    }
    if (this.playerSelect) {
      this.playerSelect.value = String(this.player);
      this.playerSelect.style.borderColor = playerCss(this.player);
    }
  }
}

/** `1:05` from 25 ms beats. */
function formatTime(tick: number, tickMs = 25): string {
  const total = Math.max(0, tick) * (tickMs / 1000);
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
