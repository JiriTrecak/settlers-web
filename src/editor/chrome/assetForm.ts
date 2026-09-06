/**
 * New-asset sheet. Name, category, type, glTF file.
 */
import { ASSET_CATEGORIES, ASSET_TYPES, type AssetCategory, type AssetType } from "../../shared";
import { btn, btnPrimary, field, label, scrim, sheet } from "../../ui";

export type AssetDraft = {
  name: string;
  category: AssetCategory;
  type: AssetType;
  file: File;
};

export class AssetForm {
  readonly root: HTMLElement;
  private readonly name: HTMLInputElement;
  private readonly category: HTMLSelectElement;
  private readonly type: HTMLSelectElement;
  private file: File | null = null;

  constructor(host: HTMLElement, hooks: { onCreate: (draft: AssetDraft) => void; onCancel: () => void }) {
    this.root = document.createElement("div");
    this.root.className = scrim;
    const panel = document.createElement("form");
    panel.className = `flex w-[22rem] flex-col gap-3 rounded-2xl p-5 font-dock ${sheet}`;
    panel.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!this.file || !this.name.value.trim()) return;
      hooks.onCreate({
        name: this.name.value,
        category: this.category.value as AssetCategory,
        type: this.type.value as AssetType,
        file: this.file,
      });
    });
    const title = document.createElement("h3");
    title.className = "m-0 text-[15px] font-semibold tracking-tight";
    title.textContent = "New asset";
    panel.append(title);
    this.name = textField(panel, "Name", "text");
    this.name.required = true;
    this.name.placeholder = "Pine";
    this.category = select(panel, "Category", ASSET_CATEGORIES, "foliage");
    this.type = select(panel, "Type", ASSET_TYPES, "prop");
    const fileLabel = document.createElement("label");
    fileLabel.className = label;
    fileLabel.textContent = "Mesh";
    const fileBtn = document.createElement("input");
    fileBtn.type = "file";
    fileBtn.accept = ".gltf,.glb,model/gltf+json,model/gltf-binary";
    fileBtn.required = true;
    fileBtn.className = "text-[13px] font-medium normal-case tracking-normal text-canopy/80";
    fileBtn.addEventListener("change", () => {
      this.file = fileBtn.files?.[0] ?? null;
    });
    fileLabel.append(fileBtn);
    const row = document.createElement("div");
    row.className = "mt-1 flex justify-end gap-1";
    row.append(action(btn, "Cancel", () => hooks.onCancel()), submit("Create"));
    panel.append(fileLabel, row);
    this.root.append(panel);
    host.append(this.root);
    this.name.focus();
  }

  destroy(): void {
    this.root.remove();
  }
}

function textField(host: HTMLElement, caption: string, type: string): HTMLInputElement {
  const wrap = document.createElement("label");
  wrap.className = label;
  wrap.textContent = caption;
  const input = document.createElement("input");
  input.type = type;
  input.className = field;
  wrap.append(input);
  host.append(wrap);
  return input;
}

function select(host: HTMLElement, caption: string, values: readonly string[], value: string): HTMLSelectElement {
  const wrap = document.createElement("label");
  wrap.className = label;
  wrap.textContent = caption;
  const el = document.createElement("select");
  el.className = field;
  for (const v of values) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    if (v === value) opt.selected = true;
    el.append(opt);
  }
  wrap.append(el);
  host.append(wrap);
  return el;
}

function action(cls: string, caption: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = cls;
  el.textContent = caption;
  el.addEventListener("click", onClick);
  return el;
}

function submit(caption: string): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "submit";
  el.className = btnPrimary;
  el.textContent = caption;
  return el;
}
