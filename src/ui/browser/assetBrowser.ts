/**
 * Right-side asset dock. Cards are a declarative list — one per catalog entry.
 */
export type AssetCard = {
  id: string;
  label: string;
};

export class AssetBrowser {
  readonly root: HTMLElement;
  private readonly buttons = new Map<string, HTMLButtonElement>();

  constructor(
    host: HTMLElement,
    spec: { assets: readonly AssetCard[]; onSelect: (id: string) => void },
  ) {
    this.root = document.createElement("div");
    this.root.className =
      "pointer-events-auto absolute right-4 top-1/2 flex w-52 -translate-y-1/2 flex-col gap-2 rounded-3xl border border-white/15 bg-black/40 p-3 text-canopy shadow-2xl shadow-black/50 backdrop-blur-xl";
    this.root.setAttribute("role", "listbox");
    this.root.setAttribute("aria-label", "Assets");
    const title = document.createElement("p");
    title.className = "px-1 font-dock text-[11px] font-medium tracking-[0.14em] text-canopy/45 uppercase";
    title.textContent = "Assets";
    const list = document.createElement("div");
    list.className = "flex flex-col gap-1";
    for (const asset of spec.assets) {
      const el = document.createElement("button");
      el.type = "button";
      el.dataset.id = asset.id;
      el.className =
        "flex appearance-none items-center gap-3 rounded-2xl border-0 bg-transparent px-3 py-2.5 text-left font-dock hover:bg-white/10 focus-visible:outline focus-visible:outline-white/30";
      const swatch = document.createElement("span");
      swatch.className = "size-8 shrink-0 rounded-xl bg-moss/70 shadow-inner";
      const name = document.createElement("span");
      name.className = "text-[13px] font-medium tracking-wide text-canopy/85";
      name.textContent = asset.label;
      el.append(swatch, name);
      el.addEventListener("click", () => spec.onSelect(asset.id));
      this.buttons.set(asset.id, el);
      list.append(el);
    }
    if (spec.assets.length === 0) {
      const empty = document.createElement("p");
      empty.className = "px-1 text-[12px] text-canopy/40";
      empty.textContent = "Drop a .gltf in assets/props/";
      list.append(empty);
    }
    this.root.append(title, list);
    host.append(this.root);
  }

  setActive(id: string | null): void {
    for (const [key, el] of this.buttons) {
      const on = key === id;
      el.classList.toggle("bg-white/15", on);
    }
  }

  destroy(): void {
    this.root.remove();
  }
}
