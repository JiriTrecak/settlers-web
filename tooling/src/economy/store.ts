/**
 * localStorage + import/export for the buildings file. Debounced so typing
 * a name does not hammer storage.
 */
import { emptyDraft, parseBuildingsFile, serializeBuildingsFile, uniqueId, type BuildingDraft, type BuildingsFile, type Civ } from "./format";
import { seedBuildings } from "./seed";

export const STORAGE_KEY = "forest-empire.buildings.v1";

const SAVE_MS = 200;

export class BuildingStore {
  file: BuildingsFile;
  civ: Civ = "roman";
  selectedId: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.file = loadLibrary();
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
    this.persist();
  }

  replace(file: BuildingsFile): void {
    this.file = file;
    if (!this.list().some((b) => b.id === this.selectedId)) {
      this.selectedId = this.list()[0]?.id ?? null;
    }
    this.persist();
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
    try {
      localStorage.setItem(STORAGE_KEY, serializeBuildingsFile(this.file));
    } catch {
      /* quota / private mode */
    }
  }

  exportText(): string {
    this.flush();
    return serializeBuildingsFile(this.file);
  }
}

export function loadLibrary(): BuildingsFile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = parseBuildingsFile(JSON.parse(raw) as unknown);
      if (parsed) return parsed;
    }
  } catch {
    /* corrupt */
  }
  return seedBuildings();
}
