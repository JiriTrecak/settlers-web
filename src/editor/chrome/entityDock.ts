import { content } from "../../content/builtin";
import { type Owner } from "../../content/schema";
import { btn, sheet } from "../../ui";
import type { WorldEditor } from "../world/worldEditor";
import { ContentEditor } from "./contentEditor";
export class EntityDock {
  readonly root = document.createElement("div");
  private readonly category = document.createElement("select");
  private readonly definition = document.createElement("select");
  private readonly owner = document.createElement("select");
  private readonly info = document.createElement("p");
  private readonly state = document.createElement("textarea");
  private readonly controls = document.createElement("div");
  private key = "";
  constructor(
    host: HTMLElement,
    private readonly editor: WorldEditor,
  ) {
    this.root.className = `pointer-events-auto absolute left-24 top-1/2 z-20 flex w-72 -translate-y-1/2 flex-col gap-3 rounded-2xl p-3 font-dock ${sheet}`;
    this.root.setAttribute("aria-label", "Gameplay entities");
    this.category.setAttribute("aria-label", "Entity category");
    this.definition.setAttribute("aria-label", "Entity definition");
    this.owner.setAttribute("aria-label", "Entity owner");
    const title = document.createElement("strong");
    title.textContent = "Entities";
    for (const kind of ["unit", "building", "item", "resource"])
      this.category.append(new Option(kind, kind));
    this.category.onchange = () => {
      editor.selectedEntity = null;
      this.options();
    };
    this.definition.onchange = () => {
      editor.entityDefinition = this.definition.value;
      const d = content.get(editor.entityDefinition);
      if (d.behaviors.campDefense || d.gatheringCapacity)
        editor.entityOwner = "none";
      this.sync();
    };
    this.owner.append(new Option("Unowned / neutral", "none"));
    for (const player of [1, 2])
      this.owner.append(new Option(`Player ${player}`, `player.${player}`));
    this.owner.onchange = () => {
      editor.entityOwner = this.owner.value as Owner;
      const p = editor.selectedPlacement();
      if (p)
        this.run(() => editor.putEntity({ ...p, owner: editor.entityOwner }));
    };
    this.state.style.cssText =
      "height:110px;background:#14201a;color:#e4e7dc;font:11px monospace;padding:8px";
    this.state.setAttribute("aria-label", "Instance initial state JSON");
    const button = (label: string, fn: () => void) => {
      const b = document.createElement("button");
      b.className = btn;
      b.textContent = label;
      b.onclick = () => this.run(fn);
      return b;
    };
    this.controls.append(
      this.state,
      button("Apply instance state", () => {
        const p = editor.selectedPlacement();
        if (p)
          editor.putEntity({
            ...p,
            initialState: JSON.parse(this.state.value),
          });
      }),
      button("Rotate 90°", () => editor.nudgeSelected(Math.PI / 2)),
      button("Delete", () => editor.deleteSelected()),
    );
    this.root.append(
      title,
      this.category,
      this.definition,
      this.owner,
      this.controls,
      this.info,
      button("Undo entity edit", () => editor.undoEntity()),
      button("Redo", () => editor.undoEntity(true)),
      button("Edit definitions", () => {
        new ContentEditor(host);
      }),
    );
    host.append(this.root);
    this.options();
    this.setOpen(false);
  }
  private run(fn: () => void) {
    try {
      fn();
      this.editor.entityMessage = "";
    } catch (e) {
      this.editor.entityMessage = (e as Error).message;
    }
    this.sync();
  }
  private options() {
    this.definition.replaceChildren(
      ...content.definitions
        .filter((d) => d.kind === this.category.value && !d.currency)
        .map((d) => new Option(d.name, d.id)),
    );
    this.editor.entityDefinition = this.definition.value;
    this.sync();
  }
  sync() {
    const p = this.editor.selectedPlacement(),
      d = content.get(p?.definition ?? this.editor.entityDefinition);
    if (!p && d.gatheringCapacity) this.editor.entityOwner = "none";
    this.owner.disabled = !!d.gatheringCapacity;
    this.controls.hidden = !p;
    this.category.disabled = !!p;
    this.definition.disabled = !!p;
    if (p) {
      this.category.value = d.kind;
      if (
        !Array.from(this.definition.options).some(
          (o) => o.value === p.definition,
        )
      ) {
        this.definition.replaceChildren(
          ...content.definitions
            .filter((def) => def.kind === d.kind)
            .map((def) => new Option(def.name, def.id)),
        );
      }
      this.definition.value = p.definition;
      this.owner.value = p.owner;
      const key = JSON.stringify(p);
      if (this.key !== key) {
        this.key = key;
        this.state.value = JSON.stringify(p.initialState ?? {}, null, 2);
      }
    } else {
      this.category.value = d.kind;
      if (
        !Array.from(this.definition.options).some(
          (o) => o.value === this.editor.entityDefinition,
        )
      ) {
        this.definition.replaceChildren(
          ...content.definitions
            .filter((def) => def.kind === d.kind)
            .map((def) => new Option(def.name, def.id)),
        );
      }
      this.owner.value = this.editor.entityOwner;
      this.definition.value = this.editor.entityDefinition;
    }
    this.info.textContent =
      this.editor.entityMessage ||
      (p
        ? `${d.name} · ${p.position.x}, ${p.position.y}\nDrag with Select. R rotates; Delete removes.`
        : `${d.description}\nClick to place. Select to move or edit.`);
  }
  setOpen(on: boolean) {
    this.root.classList.toggle("hidden", !on);
    if (on) this.sync();
  }
  destroy() {
    this.root.remove();
  }
}
