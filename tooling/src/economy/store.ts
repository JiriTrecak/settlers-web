/**
 * In-memory buildings library. Crash-pad in localStorage; Save/Load hits
 * `assets/game_data/buildings.json` through the tools Vite server.
 */
import { BUILDINGS_PATH, readProjectBuildings, writeProjectBuildings } from "./disk";
import { emptyDraft, parseBuildingsFile, serializeBuildingsFile, setRel, uniqueId, type BuildingDraft, type BuildingsFile, type Civ } from "./format";
import { marksOf, plotOf, seedBuildings } from "./seed";

export const STORAGE_KEY = "forest-empire.buildings.v1";
export const DIRTY_KEY = "forest-empire.buildings.dirty";

const SAVE_MS = 200;

export class BuildingStore {
  file: BuildingsFile;
  civ: Civ = "roman";
  selectedId: string | null = null;
  /** Last text written to / loaded from the project file. Empty = never on disk. */
  private savedText = "";
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.file = loadSession() ?? seedBuildings();
    this.selectedId = this.list()[0]?.id ?? null;
  }

  list(): BuildingDraft[] {
    return this.file.buildings
      .filter((b) => b.civ === this.civ)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }

  selected(): BuildingDraft | null {
    const id = this.selectedId;
    if (id == null) return null;
    return this.file.buildings.find((b) => b.civ === this.civ && b.id === id) ?? null;
  }

  dirty(): boolean {
    return serializeBuildingsFile(this.file) !== this.savedText;
  }

  diskHint(): string {
    if (!this.savedText) return `Unsaved · ${BUILDINGS_PATH}`;
    return this.dirty() ? `Unsaved · ${BUILDINGS_PATH}` : `Saved · ${BUILDINGS_PATH}`;
  }

  /** Project file wins when it matches the session; otherwise keep unsaved local edits. */
  async bootFromDisk(): Promise<void> {
    const project = await readProjectBuildings();
    const session = loadSession();
    const fromDisk = project ? hydrateFromSim(project) : null;
    if (fromDisk) this.savedText = serializeBuildingsFile(fromDisk);
    const sessionText = session ? serializeBuildingsFile(session) : "";
    if (session && sessionText !== this.savedText) {
      this.file = session;
    } else if (fromDisk) {
      this.file = fromDisk;
    } else if (session) {
      this.file = session;
    } else {
      this.file = seedBuildings();
    }
    if (!this.list().some((b) => b.id === this.selectedId)) {
      this.selectedId = this.list()[0]?.id ?? null;
    }
    this.flush();
  }

  async saveToProject(): Promise<string | null> {
    this.flush();
    const text = serializeBuildingsFile(this.file);
    try {
      await writeProjectBuildings(text);
    } catch (err) {
      return err instanceof Error ? err.message : "Save failed.";
    }
    this.savedText = text;
    writeDirty(false);
    return null;
  }

  async loadFromProject(): Promise<string | null> {
    let file: BuildingsFile | null;
    try {
      file = await readProjectBuildings();
    } catch (err) {
      return err instanceof Error ? err.message : "Load failed.";
    }
    if (!file) return `No file at ${BUILDINGS_PATH} — Save first.`;
    this.savedText = serializeBuildingsFile(file);
    this.replace(file, false);
    writeDirty(false);
    this.flush();
    return null;
  }

  setCiv(civ: Civ): void {
    this.civ = civ;
    this.selectedId = this.list()[0]?.id ?? null;
  }

  select(id: string): void {
    this.selectedId = id;
  }

  add(): BuildingDraft {
    const id = uniqueId(this.file.buildings, this.civ, "building");
    const draft = emptyDraft(this.civ, id);
    this.file.buildings.push(draft);
    this.selectedId = id;
    this.persist();
    return draft;
  }

  remove(): void {
    const cur = this.selected();
    if (!cur) return;
    this.file.buildings = this.file.buildings.filter((b) => b !== cur);
    this.selectedId = this.list()[0]?.id ?? null;
    this.persist();
  }

  /** Patch the selected draft. `id` is ignored if it collides inside the civ. */
  update(patch: Partial<BuildingDraft>): void {
    const cur = this.selected();
    if (!cur) return;
    if (patch.id != null && patch.id !== cur.id) {
      const id = patch.id.trim();
      if (!id) return;
      const taken = this.file.buildings.some((b) => b.civ === cur.civ && b.id === id);
      if (taken) return;
      this.selectedId = id;
      cur.id = id;
    }
    if (patch.civ != null && patch.civ !== cur.civ) {
      const id = uniqueId(
        this.file.buildings.filter((b) => b !== cur),
        patch.civ,
        patch.id ?? cur.id,
      );
      cur.civ = patch.civ;
      cur.id = id;
      this.civ = patch.civ;
      this.selectedId = id;
    }
    if (patch.name != null) cur.name = patch.name;
    if (patch.built != null) cur.built = patch.built;
    if (patch.scaffold != null) cur.scaffold = patch.scaffold;
    if (patch.plank != null) cur.plank = Math.max(0, Math.floor(patch.plank));
    if (patch.stone != null) cur.stone = Math.max(0, Math.floor(patch.stone));
    if (patch.blocked != null) cur.blocked = patch.blocked;
    if (patch.protected != null) cur.protected = patch.protected;
    if (patch.buildMarks != null) cur.buildMarks = patch.buildMarks;
    if (patch.flatten != null) cur.flatten = patch.flatten;
    this.persist();
  }

  /**
   * Paint one iso cell. Occupied (`blocked`) is a subset of plot (`protected`):
   * adding occupied also marks plot; clearing plot also clears occupied.
   * Sticks (`buildMarks`) are independent.
   */
  paintCell(layer: "blocked" | "protected" | "buildMarks", dx: number, dy: number, on: boolean): void {
    const cur = this.selected();
    if (!cur) return;
    if (layer === "blocked") {
      cur.blocked = setRel(cur.blocked, dx, dy, on);
      if (on) cur.protected = setRel(cur.protected, dx, dy, true);
    } else if (layer === "protected") {
      cur.protected = setRel(cur.protected, dx, dy, on);
      if (!on) cur.blocked = setRel(cur.blocked, dx, dy, false);
    } else {
      cur.buildMarks = setRel(cur.buildMarks, dx, dy, on);
    }
    this.persist();
  }

  replace(file: BuildingsFile, persist = true): void {
    this.file = hydrateFromSim(file);
    if (!this.list().some((b) => b.id === this.selectedId)) {
      this.selectedId = this.list()[0]?.id ?? null;
    }
    if (persist) this.persist();
  }

  resetToSeed(): void {
    this.file = seedBuildings();
    this.selectedId = this.list()[0]?.id ?? null;
    this.persist();
  }

  persist(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), SAVE_MS);
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const text = serializeBuildingsFile(this.file);
    try {
      localStorage.setItem(STORAGE_KEY, text);
      writeDirty(text !== this.savedText);
    } catch {
      /* quota / private mode */
    }
  }
}

function loadSession(): BuildingsFile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = parseBuildingsFile(JSON.parse(raw) as unknown);
    return parsed ? hydrateFromSim(parsed) : null;
  } catch {
    return null;
  }
}

function writeDirty(on: boolean): void {
  try {
    if (on) localStorage.setItem(DIRTY_KEY, "1");
    else localStorage.removeItem(DIRTY_KEY);
  } catch {
    /* private mode */
  }
}

/** Old saves had no plot / stick arrays — fill from the TS def when empty. */
function hydrateFromSim(file: BuildingsFile): BuildingsFile {
  for (const b of file.buildings) {
    if (b.blocked.length === 0 && b.protected.length === 0) {
      const plot = plotOf(b.id);
      b.blocked = plot.blocked;
      b.protected = plot.protected;
    }
    if (b.buildMarks.length === 0) b.buildMarks = marksOf(b.id);
  }
  return file;
}
