import { builtinSource } from "../../content/builtin";
import { ContentRegistry, type ContentSource } from "../../content/registry";
import { authoredDefinitionSchema } from "../../content/schema";
import { btn, sheet } from "../../ui";

/** Draft is isolated. Fields and JSON edit the same document; only a validated save commits. */
export class ContentEditor {
  private readonly root = document.createElement("dialog");
  private source: ContentSource = structuredClone(builtinSource);
  private revision = "";
  private readonly chooser = document.createElement("select");
  private readonly text = document.createElement("textarea");
  private readonly fields = document.createElement("div");
  private readonly error = document.createElement("p");
  private selected = "definitions";
  constructor(host: HTMLElement) {
    this.root.className = `pointer-events-auto m-auto w-[880px] max-w-[95vw] max-h-[90vh] overflow-auto rounded-2xl p-6 font-dock ${sheet}`;
    this.root.style.color = "#e3e6d5";
    this.root.style.background = "#15201b";
    const title = document.createElement("h2");
    title.textContent = "Gameplay definitions";
    this.text.style.cssText =
      "width:100%;height:45vh;font:12px monospace;white-space:pre;background:#0e1512;color:#dae0ce;padding:12px";
    for (const category of [
      "definitions",
      "behaviorSets",
      "actions",
      "rules",
    ]) {
      const option = new Option(category, category);
      this.chooser.append(option);
    }
    const apply = document.createElement("button");
    apply.className = btn;
    apply.textContent = "Apply draft";
    apply.onclick = () => this.apply();
    const save = document.createElement("button");
    save.className = btn;
    save.textContent = "Validate & save JSON";
    save.onclick = () => void this.save();
    const close = document.createElement("button");
    close.className = btn;
    close.textContent = "Close";
    close.onclick = () => {
      this.root.close();
      this.root.remove();
    };
    const help = document.createElement("p");
    help.textContent =
      "Saved changes apply after an explicit page reload. Edit linked definitions together, apply the draft, then save the complete graph to content/game.json.";
    this.chooser.onchange = () => {
      if (!this.apply(false)) {
        this.chooser.value = this.selected;
        return;
      }
      this.selected = this.chooser.value;
      this.render();
    };
    this.root.append(
      title,
      help,
      this.chooser,
      this.fields,
      this.text,
      this.error,
      apply,
      save,
      close,
    );
    host.append(this.root);
    this.render();
    this.root.showModal();
    void this.load();
  }
  private async load() {
    try {
      const response = await fetch("/__authoring/content");
      if (!response.ok)
        throw new Error(
          "Project content saving requires the local development server.",
        );
      const data = await response.json();
      this.source = data.source;
      this.revision = data.revision;
      this.render();
    } catch (e) {
      this.error.textContent = (e as Error).message;
    }
  }
  private apply(validate = true) {
    try {
      const next = {
        ...this.source,
        [this.selected]: JSON.parse(this.text.value),
      };
      if (validate) new ContentRegistry(next);
      this.source = next;
      this.error.textContent = validate
        ? "Draft is valid. Save to apply it to the project."
        : "";
      return true;
    } catch (e) {
      this.error.textContent = (e as Error).message;
      return false;
    }
  }
  private render() {
    this.text.value = JSON.stringify(
      this.source[this.selected as keyof ContentSource],
      null,
      2,
    );
    this.fields.replaceChildren();
    if (this.selected !== "definitions") return;
    const select = document.createElement("select");
    for (const raw of this.source.definitions) {
      const d = authoredDefinitionSchema.parse(raw);
      select.append(new Option(`${d.kind} · ${d.name}`, d.id));
    }
    const form = document.createElement("div");
    const show = () => {
      form.replaceChildren();
      const raw = this.source.definitions.find(
        (d) => (d as { id: string }).id === select.value,
      ) as Record<string, unknown>;
      if (!raw) return;
      for (const key of ["name", "description", "maxHp", "armor"]) {
        const label = document.createElement("label");
        label.textContent = key;
        const input = document.createElement("input"),
          body = raw.body as Record<string, unknown> | undefined;
        input.value = String(
          (key === "maxHp" || key === "armor" ? body?.[key] : raw[key]) ?? "",
        );
        if ((key === "maxHp" || key === "armor") && !body) continue;
        input.style.cssText = "background:#23342a;margin:6px;padding:5px";
        input.onchange = () => {
          if (!this.apply(false)) return;
          const current = this.source.definitions.find(
            (d) => (d as { id: string }).id === select.value,
          ) as Record<string, unknown>;
          if (key === "maxHp" || key === "armor")
            (current.body as Record<string, unknown>)[key] = Number(
              input.value,
            );
          else current[key] = input.value;
          this.text.value = JSON.stringify(this.source.definitions, null, 2);
        };
        label.append(input);
        form.append(label);
      }
    };
    select.onchange = show;
    show();
    this.fields.append(select, form);
  }
  private async save() {
    if (!this.apply() || !this.revision) return;
    try {
      const response = await fetch("/__authoring/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: this.revision, source: this.source }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      this.revision = data.revision;
      this.error.textContent =
        "Saved. Reload the map to use this content revision.";
    } catch (e) {
      this.error.textContent = (e as Error).message;
    }
  }
}
