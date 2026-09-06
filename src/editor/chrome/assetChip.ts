/**
 * Current stamp asset. Click opens the catalogue.
 */
import { sheet } from "../../ui";

export class AssetChip {
  readonly root: HTMLButtonElement;
  private readonly name: HTMLElement;
  private readonly meta: HTMLElement;

  constructor(host: HTMLElement, hooks: { onOpen: () => void }) {
    this.root = document.createElement("button");
    this.root.type = "button";
    this.root.className = `pointer-events-auto absolute bottom-5 left-4 flex min-w-40 flex-col items-start gap-0.5 rounded-2xl px-3 py-2 text-left font-dock hover:bg-white/[0.04] ${sheet}`;
    this.root.setAttribute("aria-label", "Current asset");
    this.name = document.createElement("span");
    this.name.className = "text-[13px] font-medium tracking-tight";
    this.meta = document.createElement("span");
    this.meta.className = "text-[11px] tracking-wide text-canopy/40";
    this.root.append(this.name, this.meta);
    this.root.addEventListener("click", hooks.onOpen);
    host.append(this.root);
    this.set(null);
  }

  set(asset: { name: string; category: string } | null): void {
    this.name.textContent = asset?.name ?? "No asset";
    this.meta.textContent = asset ? `${title(asset.category)} · click to change` : "Open catalogue";
  }

  destroy(): void {
    this.root.remove();
  }
}

function title(s: string): string {
  return s.slice(0, 1).toUpperCase() + s.slice(1);
}
