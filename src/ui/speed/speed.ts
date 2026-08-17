/**
 * Playback speed under the minimap. Session owns the multiplier; this only emits it.
 */
export const GAME_SPEEDS = [1, 2, 4, 8] as const;
export type GameSpeed = (typeof GAME_SPEEDS)[number];

export function isGameSpeed(n: number): n is GameSpeed {
  return (GAME_SPEEDS as readonly number[]).includes(n);
}

export class SpeedControl {
  private readonly root: HTMLDivElement;
  private readonly buttons = new Map<GameSpeed, HTMLButtonElement>();
  private speed: GameSpeed = 1;

  constructor(host: HTMLElement, hooks: { onSpeed: (speed: GameSpeed) => void; speed?: GameSpeed }) {
    this.speed = hooks.speed ?? 1;
    this.root = document.createElement("div");
    this.root.className = "hud-speed";
    this.root.setAttribute("role", "group");
    this.root.setAttribute("aria-label", "Game speed");

    for (const n of GAME_SPEEDS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = `${n}×`;
      btn.addEventListener("click", () => {
        this.setSpeed(n);
        hooks.onSpeed(n);
      });
      this.buttons.set(n, btn);
      this.root.append(btn);
    }
    this.sync();
    host.append(this.root);
  }

  setSpeed(speed: GameSpeed): void {
    this.speed = speed;
    this.sync();
  }

  destroy(): void {
    this.root.remove();
  }

  private sync(): void {
    for (const [n, btn] of this.buttons) {
      btn.classList.toggle("is-selected", n === this.speed);
    }
  }
}
