/**
 * Map name field + dirty mark. Title is stored on the `UtcMap`.
 */
export class DocTitle {
  readonly root: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly dirty: HTMLElement;

  constructor(host: HTMLElement, hooks: { onName: (name: string) => void }) {
    this.root = document.createElement("div");
    this.root.className =
      "pointer-events-auto flex items-center gap-2 rounded-3xl border border-white/15 bg-black/40 px-4 py-2 text-canopy shadow-2xl shadow-black/50 backdrop-blur-xl";
    this.input = document.createElement("input");
    this.input.type = "text";
    this.input.maxLength = 80;
    this.input.spellcheck = false;
    this.input.className =
      "w-52 appearance-none border-0 bg-transparent p-0 font-dock text-[15px] font-medium tracking-wide text-canopy outline-none";
    this.input.addEventListener("change", () => hooks.onName(this.input.value));
    this.input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      this.input.blur();
    });
    this.dirty = document.createElement("span");
    this.dirty.className = "hidden text-[18px] leading-none text-canopy/70";
    this.dirty.textContent = "•";
    this.dirty.title = "Unsaved changes";
    this.root.append(this.input, this.dirty);
    host.append(this.root);
  }

  setName(name: string): void {
    if (this.input.value === name) return;
    this.input.value = name;
  }

  setDirty(dirty: boolean): void {
    this.dirty.classList.toggle("hidden", !dirty);
  }

  destroy(): void {
    this.root.remove();
  }
}
