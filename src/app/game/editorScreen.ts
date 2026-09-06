/**
 * In-game world editor: docks + WorldEditor on the game canvas.
 * Owns dirty state, save shortcuts, catalogue modal, and leave/load/new confirms.
 */
import { Confirm, GameScreen } from "../../ui";
import { emptyUtcMap, stringifyUtcMap, type GridMode } from "../../shared";
import { EditorChrome, MapStore, WorldEditor } from "../../editor";
import { CatalogueStore } from "../../editor/assets/store";
import { BrushPresetStore } from "../../editor/brush/presets";
import { CatalogModal } from "../../editor/chrome/catalogModal";
import { EditorBridge } from "../../editor/control/editorBridge";
import { EditorControl } from "../../editor/control/editorControl";
import { McpPrefsStore } from "../../editor/control/mcpPrefs";

export class EditorScreen extends GameScreen {
  private readonly editor: WorldEditor;
  private readonly files: MapStore;
  private readonly library = new CatalogueStore();
  private readonly presets = new BrushPresetStore();
  private presetName = "";
  private readonly chrome: EditorChrome;
  private readonly onLeave: () => void;
  private saved = stringifyUtcMap(emptyUtcMap());
  private dialog: Confirm | null = null;
  private modal: CatalogModal | null = null;
  private readonly mcpPrefs = new McpPrefsStore();
  private mcpOpen = false;
  private readonly bridge: EditorBridge;
  private readonly onKey: (e: KeyboardEvent) => void;
  private readonly onUnload: (e: BeforeUnloadEvent) => void;

  constructor(canvas: HTMLCanvasElement, hooks: { onLeave: () => void }) {
    super("screen");
    this.onLeave = hooks.onLeave;
    this.editor = new WorldEditor(canvas, {
      host: this.root,
      onChange: () => this.syncDoc(),
      onNeedAsset: () => this.openCatalogue(),
      onView: () => this.chrome.setGameCam(this.editor.gameCam),
      onBrush: () => this.syncBrush(),
      onClean: () => this.syncClean(),
      onSculpt: () => this.syncSculpt(),
      onSelect: () => this.syncSelect(),
    });
    this.editor.setLibrary(this.library.urls(), this.library.types());
    const first = this.library.doc.assets[0];
    if (first) this.editor.setAsset(first.id);
    this.files = new MapStore();
    this.chrome = new EditorChrome(this.root, {
      onNew: () => void this.askNew(),
      onSave: () => void this.save(),
      onSaveAs: () => void this.save(true),
      onLoad: () => void this.askLoad(),
      onLeave: () => void this.askLeave(),
      onSelect: () => this.armSelect(),
      onStamp: () => this.stamp(),
      onBrush: () => this.armBrush(),
      onClean: () => this.armClean(),
      onSculpt: () => this.armSculpt(),
      onCatalogue: () => this.openCatalogue(),
      onGrid: () => this.toggleGridMenu(),
      onGridMode: (mode) => this.setGridMode(mode),
      onGameCam: () => this.editor.toggleGameCam(),
      onMcp: () => this.toggleMcp(),
      onMcpEnabled: (on) => this.setMcpEnabled(on),
      onMcpPort: (n) => this.setMcpPort(n),
      onRadius: (n) => this.editor.setBrushRadius(n),
      onDensity: (n) => this.editor.setBrushDensity(n),
      onApply: () => this.editor.applyBrush(),
      onNewPreset: () => this.newPreset(),
      onAddSlot: () => this.openCatalogue("brush"),
      onRemoveSlot: (id) => {
        this.editor.kit.remove(id);
        this.syncBrush();
      },
      onSlotPct: (id, pct) => {
        this.editor.kit.setPct(id, pct);
        this.syncBrush();
      },
      onSlotScale: (id, scale) => {
        this.editor.kit.setScale(id, scale);
        this.syncBrush();
      },
      onSavePreset: (name) => this.savePreset(name),
      onDeletePreset: () => void this.askDeletePreset(),
      onLoadPreset: (id) => this.loadPreset(id),
      onCleanRadius: (n) => this.editor.setCleanRadius(n),
      onCleanType: (type) => this.editor.setCleanType(type),
      onSculptRadius: (n) => this.editor.setSculptRadius(n),
      onSculptStrength: (n) => this.editor.setSculptStrength(n),
      onSculptMode: (mode) => this.editor.setSculptMode(mode),
      onApplySculpt: () => this.editor.applySculpt(),
      onYaw: (rad) => this.editor.setSelectedYaw(rad),
      onName: (name) => this.editor.rename(name),
    });
    this.chrome.setTool(this.editor.tool);
    this.chrome.setGridMenu(this.editor.gridMenu);
    this.chrome.setGridMode(this.editor.gridMode);
    this.chrome.setGameCam(this.editor.gameCam);
    this.syncBrush();
    this.syncAsset();
    this.syncDoc();
    this.bridge = new EditorBridge(new EditorControl(this.editor, this.library, () => this.syncRemote()), () => this.syncMcp());
    this.syncMcp();
    this.onEscape(() => {
      if (this.mcpOpen) {
        this.toggleMcp();
        return;
      }
      if (this.editor.tool === "select" && this.editor.select.id) {
        this.editor.select.clear();
        this.editor.setTool("select");
        return;
      }
      void this.askLeave();
    });
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
    this.applyMcp();
  }

  override tick(dtMs: number, _nowMs: number): void {
    this.editor.tick(dtMs);
  }

  override destroy(): void {
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("beforeunload", this.onUnload);
    this.modal?.close();
    this.dialog?.cancel();
    this.bridge.stop();
    this.chrome.destroy();
    this.editor.stop();
    super.destroy();
  }

  private armSelect(): void {
    this.editor.setTool("select");
    this.chrome.setTool("select");
    this.chrome.setGridMenu(this.editor.gridMenu);
    this.syncBrush();
    this.syncSelect();
  }

  private stamp(): void {
    if (!this.editor.asset) this.openCatalogue();
    else {
      this.editor.setTool("stamp");
      this.chrome.setTool("stamp");
      this.chrome.setGridMenu(this.editor.gridMenu);
      this.syncBrush();
    }
  }

  private armBrush(): void {
    this.editor.setTool("brush");
    this.chrome.setTool("brush");
    this.chrome.setGridMenu(this.editor.gridMenu);
    this.syncBrush();
  }

  private armClean(): void {
    this.editor.setTool("clean");
    this.chrome.setTool("clean");
    this.chrome.setGridMenu(this.editor.gridMenu);
    this.syncBrush();
  }

  private armSculpt(): void {
    this.editor.setTool("sculpt");
    this.chrome.setTool("sculpt");
    this.chrome.setGridMenu(this.editor.gridMenu);
    this.syncBrush();
  }

  private syncBrush(): void {
    const urls = this.library.urls();
    this.chrome.setBrushOpen(this.editor.tool === "brush");
    this.chrome.setBrush({
      radius: this.editor.brush.radius,
      density: this.editor.brush.density,
      ready: this.editor.brush.any() && this.editor.kit.slots.length > 0,
      slots: this.editor.kit.slots.map((s) => ({
        ...s,
        name: this.library.entry(s.asset)?.name ?? s.asset,
        url: urls.get(s.asset),
      })),
      presets: this.presets.list,
      active: this.presets.active,
      presetName: this.presetName,
    });
    this.syncClean();
    this.syncSculpt();
    this.syncSelect();
  }

  private syncSelect(): void {
    const stamp = this.editor.selectedStamp();
    this.chrome.setSelectOpen(this.editor.tool === "select");
    this.chrome.setSelect({
      name: stamp ? (this.library.entry(stamp.asset)?.name ?? stamp.asset) : null,
      yaw: stamp?.yaw ?? 0,
    });
  }

  private syncClean(): void {
    this.chrome.setCleanOpen(this.editor.tool === "clean");
    this.chrome.setClean({
      radius: this.editor.clean.radius,
      type: this.editor.clean.type,
    });
  }

  private syncSculpt(): void {
    this.chrome.setSculptOpen(this.editor.tool === "sculpt");
    this.chrome.setSculpt({
      radius: this.editor.sculpt.radius,
      strength: this.editor.sculpt.strength,
      mode: this.editor.sculpt.mode,
      ready: this.editor.sculpt.mask.any(),
    });
  }

  private newPreset(): void {
    this.presets.active = null;
    this.presetName = "";
    this.editor.kit.clear();
    this.editor.setBrushRadius(4);
    this.editor.setBrushDensity(0.45);
    this.syncBrush();
  }

  private savePreset(name: string): void {
    const next = this.presets.save(name, {
      radius: this.editor.brush.radius,
      density: this.editor.brush.density,
      slots: this.editor.kit.slots,
    });
    this.presetName = next.name;
    this.syncBrush();
  }

  private loadPreset(id: string): void {
    const p = this.presets.get(id);
    if (!p) return;
    this.presets.active = id;
    this.presetName = p.name;
    this.editor.kit.load(p.slots);
    this.editor.setBrushRadius(p.radius);
    this.editor.setBrushDensity(p.density);
    this.syncBrush();
  }

  private async askDeletePreset(): Promise<void> {
    if (!this.presets.active) return;
    const p = this.presets.get(this.presets.active);
    const choice = await this.confirm("Delete preset", `Remove “${p?.name ?? "this preset"}”?`, [
      { id: "cancel", label: "Cancel" },
      { id: "delete", label: "Delete", kind: "danger" },
    ]);
    if (choice !== "delete") return;
    this.presets.remove(this.presets.active);
    const still = this.presets.active ? this.presets.get(this.presets.active) : undefined;
    this.presetName = still?.name ?? "";
    if (still) {
      this.editor.kit.load(still.slots);
      this.editor.setBrushRadius(still.radius);
      this.editor.setBrushDensity(still.density);
    }
    this.syncBrush();
  }

  private toggleGridMenu(): void {
    this.editor.toggleGridMenu();
    this.chrome.setTool(this.editor.tool);
    this.chrome.setGridMenu(this.editor.gridMenu);
    this.syncBrush();
  }

  private setGridMode(mode: GridMode): void {
    this.editor.setGridMode(mode);
    this.chrome.setGridMenu(this.editor.gridMenu);
    this.chrome.setGridMode(this.editor.gridMode);
  }

  private openCatalogue(forTool: "stamp" | "brush" = this.editor.tool === "brush" ? "brush" : "stamp"): void {
    if (this.modal) return;
    this.modal = new CatalogModal(this.root, {
      store: this.library,
      selected: forTool === "brush" ? (this.editor.kit.slots.at(-1)?.asset ?? this.editor.asset) : this.editor.asset,
      onPick: (id) => {
        if (forTool === "brush") this.editor.kit.add(id);
        else this.pickAsset(id);
        this.modal?.close();
        this.syncBrush();
      },
      onClose: () => {
        this.modal = null;
      },
      onLibrary: () => {
        this.editor.setLibrary(this.library.urls(), this.library.types());
        this.syncAsset();
      },
    });
  }

  private pickAsset(id: string): void {
    this.editor.setAsset(id);
    this.chrome.setTool(this.editor.tool);
    this.syncBrush();
    this.syncAsset();
  }

  private syncAsset(): void {
    this.chrome.setAsset(this.editor.asset ? (this.library.entry(this.editor.asset) ?? null) : null);
  }

  private syncRemote(): void {
    this.chrome.setTool(this.editor.tool);
    this.chrome.setGridMenu(this.editor.gridMenu);
    this.chrome.setGameCam(this.editor.gameCam);
    this.syncBrush();
    this.syncAsset();
    this.syncDoc();
  }

  private toggleMcp(): void {
    this.mcpOpen = !this.mcpOpen;
    this.syncMcp();
  }

  private setMcpEnabled(on: boolean): void {
    this.mcpPrefs.setEnabled(on);
    this.applyMcp();
  }

  private setMcpPort(n: number): void {
    this.mcpPrefs.setPort(n);
    this.applyMcp();
  }

  private applyMcp(): void {
    if (this.mcpPrefs.value.enabled) this.bridge.start(this.mcpPrefs.value.port);
    else this.bridge.stop();
    this.syncMcp();
  }

  private syncMcp(): void {
    this.chrome.setMcpOpen(this.mcpOpen);
    this.chrome.setMcp({
      enabled: this.mcpPrefs.value.enabled,
      port: this.mcpPrefs.value.port,
      link: this.bridge.link,
    });
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
    if (e.metaKey || e.ctrlKey || e.altKey) {
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        void this.save(e.shiftKey);
      }
      return;
    }
    if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) return;
    const k = e.key.toLowerCase();
    if (k === "r" && (this.editor.tool === "stamp" || this.editor.tool === "select")) {
      e.preventDefault();
      this.editor.rotateStamp();
      this.syncSelect();
      return;
    }
    if (this.editor.tool === "select" && this.editor.select.id) {
      if (k === "q") {
        e.preventDefault();
        this.editor.nudgeSelected(-Math.PI / 12);
        return;
      }
      if (k === "e") {
        e.preventDefault();
        this.editor.nudgeSelected(Math.PI / 12);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        this.editor.deleteSelected();
        return;
      }
    }
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
