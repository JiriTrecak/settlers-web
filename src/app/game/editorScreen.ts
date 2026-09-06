/**
 * In-game world editor: docks + WorldEditor on the game canvas.
 * Owns dirty state, save shortcuts, catalogue modal, and leave/load/new confirms.
 */
import { Confirm, GameScreen } from "../../ui";
import { emptyUtcMap, stringifyUtcMap } from "../../shared";
import { EditorChrome, MapStore, WorldEditor } from "../../editor";
import { CatalogueStore } from "../../editor/assets/store";
import { CatalogModal } from "../../editor/chrome/catalogModal";

export class EditorScreen extends GameScreen {
  private readonly editor: WorldEditor;
  private readonly files: MapStore;
  private readonly library = new CatalogueStore();
  private readonly chrome: EditorChrome;
  private readonly onLeave: () => void;
  private saved = stringifyUtcMap(emptyUtcMap());
  private dialog: Confirm | null = null;
  private modal: CatalogModal | null = null;
  private readonly onKey: (e: KeyboardEvent) => void;
  private readonly onUnload: (e: BeforeUnloadEvent) => void;

  constructor(canvas: HTMLCanvasElement, hooks: { onLeave: () => void }) {
    super("screen");
    this.onLeave = hooks.onLeave;
    this.editor = new WorldEditor(canvas, {
      host: this.root,
      onChange: () => this.syncDoc(),
      onNeedAsset: () => this.openCatalogue(),
    });
    this.editor.setLibrary(this.library.urls());
    const first = this.library.doc.assets[0];
    if (first) this.editor.setAsset(first.id);
    this.files = new MapStore();
    this.chrome = new EditorChrome(this.root, {
      onNew: () => void this.askNew(),
      onSave: () => void this.save(),
      onSaveAs: () => void this.save(true),
      onLoad: () => void this.askLoad(),
      onLeave: () => void this.askLeave(),
      onStamp: () => this.stamp(),
      onCatalogue: () => this.openCatalogue(),
      onName: (name) => this.editor.rename(name),
    });
    this.chrome.setTool(this.editor.tool);
    this.syncAsset();
    this.syncDoc();
    this.onEscape(() => void this.askLeave());
    this.onKey = (e) => this.shortcut(e);
    this.onUnload = (e) => {
      if (!this.dirty() && !this.library.dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("beforeunload", this.onUnload);
  }

  start(): void {
    this.editor.start();
  }

  override tick(dtMs: number, _nowMs: number): void {
    this.editor.tick(dtMs);
  }

  override destroy(): void {
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("beforeunload", this.onUnload);
    this.modal?.close();
    this.dialog?.cancel();
    this.chrome.destroy();
    this.editor.stop();
    super.destroy();
  }

  private stamp(): void {
    if (!this.editor.asset) this.openCatalogue();
    else {
      this.editor.setTool("stamp");
      this.chrome.setTool("stamp");
    }
  }

  private openCatalogue(): void {
    if (this.modal) return;
    this.modal = new CatalogModal(this.root, {
      store: this.library,
      selected: this.editor.asset,
      onPick: (id) => {
        this.pickAsset(id);
        this.modal?.close();
      },
      onClose: () => {
        this.modal = null;
      },
      onLibrary: () => {
        this.editor.setLibrary(this.library.urls());
        this.syncAsset();
      },
    });
  }

  private pickAsset(id: string): void {
    this.editor.setAsset(id);
    this.chrome.setTool("stamp");
    this.syncAsset();
  }

  private syncAsset(): void {
    this.chrome.setAsset(this.editor.asset ? (this.library.entry(this.editor.asset) ?? null) : null);
  }

  private dirty(): boolean {
    return stringifyUtcMap(this.editor.map) !== this.saved;
  }

  private syncDoc(): void {
    this.chrome.setName(this.editor.map.name);
    this.chrome.setDirty(this.dirty());
  }

  private markClean(): void {
    this.saved = stringifyUtcMap(this.editor.map);
    this.syncDoc();
  }

  private shortcut(e: KeyboardEvent): void {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "s") return;
    e.preventDefault();
    void this.save(e.shiftKey);
  }

  private async save(asNew = false): Promise<boolean> {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const result = await this.files.save(this.editor.map, asNew);
    if (result === "ok") {
      this.markClean();
      return true;
    }
    if (result === "fail") await this.alert("Couldn't save", "The map file could not be written.");
    return false;
  }

  private async askLeave(): Promise<void> {
    if (this.modal) return;
    if (!(await this.ifClean("Save this map before leaving?"))) return;
    if (this.library.dirty) {
      const choice = await this.confirm("Unsaved catalogue", "Save the catalogue before leaving?", [
        { id: "cancel", label: "Cancel" },
        { id: "discard", label: "Discard", kind: "danger" },
        { id: "save", label: "Save", kind: "primary" },
      ]);
      if (choice === "save" && (await this.library.save()) !== "ok") return;
      if (choice !== "discard" && choice !== "save") return;
    }
    this.onLeave();
  }

  private async askNew(): Promise<void> {
    if (!(await this.ifClean("Save this map before starting a new one?"))) return;
    this.files.clearFile();
    this.editor.replace(emptyUtcMap());
    this.markClean();
  }

  private async askLoad(): Promise<void> {
    if (!(await this.ifClean("Save this map before loading another?"))) return;
    const result = await this.files.load();
    if (!result) return;
    if (!result.ok) {
      await this.alert("Couldn't load", "That file isn't a valid .utcmap.");
      return;
    }
    this.editor.replace(result.map);
    this.markClean();
  }

  private async ifClean(body: string): Promise<boolean> {
    if (!this.dirty()) return true;
    const choice = await this.confirm("Unsaved changes", body, [
      { id: "cancel", label: "Cancel" },
      { id: "discard", label: "Discard", kind: "danger" },
      { id: "save", label: "Save", kind: "primary" },
    ]);
    if (choice === "save") return this.save();
    return choice === "discard";
  }

  private async confirm(
    title: string,
    body: string,
    choices: { id: string; label: string; kind?: "danger" | "primary" }[],
  ): Promise<string | undefined> {
    this.dialog?.cancel();
    const dialog = new Confirm(this.root, { title, body, choices });
    this.dialog = dialog;
    const choice = await dialog.result;
    if (this.dialog === dialog) this.dialog = null;
    return choice;
  }

  private async alert(title: string, body: string): Promise<void> {
    await this.confirm(title, body, [{ id: "ok", label: "OK", kind: "primary" }]);
  }
}
