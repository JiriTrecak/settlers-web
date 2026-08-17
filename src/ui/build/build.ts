/**
 * Placeable-hut strip. Session owns the selected kind; this only emits it.
 */
import type { BuildingKind } from "../../sim/data/buildings";

export const PLACEABLE: { kind: BuildingKind; label: string }[] = [
  { kind: "lumberjack", label: "Lumberjack" },
  { kind: "forester", label: "Forester" },
  { kind: "sawmill", label: "Sawmill" },
  { kind: "small_livinghouse", label: "House" },
];

export class BuildMenu {
  private readonly root: HTMLDivElement;
  private readonly buttons = new Map<BuildingKind, HTMLButtonElement>();
  private kind: BuildingKind | null = null;

  constructor(host: HTMLElement, hooks: { onKind: (kind: BuildingKind | null) => void }) {
    this.root = document.createElement("div");
    this.root.className = "hud-build";
    this.root.setAttribute("role", "group");
    this.root.setAttribute("aria-label", "Build");

    for (const { kind, label } of PLACEABLE) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.addEventListener("click", () => {
        const next = this.kind === kind ? null : kind;
        this.setKind(next);
        hooks.onKind(next);
      });
      this.buttons.set(kind, btn);
      this.root.append(btn);
    }
    this.sync();
    host.append(this.root);
  }

  setKind(kind: BuildingKind | null): void {
    this.kind = kind;
    this.sync();
  }

  destroy(): void {
    this.root.remove();
  }

  private sync(): void {
    for (const [kind, btn] of this.buttons) {
      btn.classList.toggle("is-selected", kind === this.kind);
    }
  }
}
