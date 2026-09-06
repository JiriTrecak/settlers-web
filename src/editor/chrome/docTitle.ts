/**
 * Map name field + dirty mark. Title is stored on the `UtcMap`.
 */
export class DocTitle {
  readonly root: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly dirty: HTMLElement;

  constructor(host: HTMLElement, hooks: { onName: (name: string) => void }) {
    this.root = document.createElement("div");
    this.root.className = "pointer-events-auto flex items-center gap-1.5 px-2.5";
    this.input = document.createElement("input");
    this.input.type = "text";
    this.input.maxLength = 80;
    this.input.spellcheck = false;
    this.input.className =
      "w-44 appearance-none border-0 bg-transparent p-0 font-dock text-[13px] font-medium tracking-tight text-canopy outline-none placeholder:text-canopy/35";
    this.input.placeholder = "Untitled";
    this.input.addEventListener("change", () => hooks.onName(this.input.value));
    this.input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      this.input.blur();
    });
    this.dirty = document.createElement("span");
    this.dirty.className = "hidden font-dock text-[11px] font-medium tracking-wide text-orange-400";
    this.dirty.textContent = "edited";
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
