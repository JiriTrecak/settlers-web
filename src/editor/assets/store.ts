/**
 * Live catalogue. Default is the project file; Open points at another JSON (+ folder for meshes).
 */
import {
  PROJECT_CATALOG_PATH,
  assetIdFromName,
  parseCatalogue,
  type AssetCategory,
  type AssetType,
  type CatalogEntry,
  type Catalogue,
} from "../../shared";
import { pickCatalogueDir, pickCatalogueFile, readDirFile, writeCatalogueDir, type DirHandle } from "./catDisk";
import { projectCatalogue, projectMeshUrl } from "./project";

export type CatalogSource = { kind: "project"; path: string } | { kind: "file"; path: string };

export class CatalogueStore {
  source: CatalogSource = { kind: "project", path: PROJECT_CATALOG_PATH };
  doc: Catalogue = projectCatalogue();
  dirty = false;
  private dir: DirHandle | null = null;
  private readonly extra = new Map<string, string>();
  private readonly pending = new Map<string, Blob>();

  get path(): string {
    return this.source.path;
  }

  entry(id: string): CatalogEntry | undefined {
    return this.doc.assets.find((a) => a.id === id);
  }

  types(): Map<string, AssetType> {
    return new Map(this.resolvedAssets().map((a) => [a.id, a.type]));
  }

  urls(): Map<string, string> {
    const out = new Map<string, string>();
    for (const asset of this.resolvedAssets()) {
      const extra = this.extra.get(asset.id);
      const project = projectMeshUrl(asset.file);
      if (extra) out.set(asset.id, extra);
      else if (project) out.set(asset.id, project);
    }
    return out;
  }

  /** Only published scenery is available in the project catalogue. */
  private resolvedAssets(): readonly CatalogEntry[] {
    return this.doc.assets;
  }

  async openFile(): Promise<"ok" | "cancel" | "fail"> {
    const picked = await pickCatalogueFile();
    if (!picked) return "cancel";
    let raw: unknown;
    try {
      raw = JSON.parse(picked.text);
    } catch {
      return "fail";
    }
    const doc = parseCatalogue(raw);
    if (!doc) return "fail";
    this.doc = doc;
    this.source = { kind: "file", path: picked.name };
    this.dir = null;
    this.extra.clear();
    this.pending.clear();
    this.dirty = false;
    await this.linkFolderIfNeeded();
    return "ok";
  }

  async save(): Promise<"ok" | "cancel" | "fail"> {
    try {
      if (!this.dir) {
        const dir = await pickCatalogueDir();
        if (!dir) return "cancel";
        this.dir = dir;
        this.source = { kind: "file", path: `${dir.name}/catalog.json` };
      }
      const files = new Map<string, Blob>();
      for (const [id, blob] of this.pending) {
        const entry = this.entry(id);
        if (entry) files.set(entry.file, blob);
      }
      for (const asset of this.doc.assets) {
        if (files.has(asset.file)) continue;
        const url = projectMeshUrl(asset.file) ?? this.extra.get(asset.id);
        if (!url) continue;
        const res = await fetch(url);
        if (res.ok) files.set(asset.file, await res.blob());
      }
      await writeCatalogueDir(this.dir, this.doc, files);
      this.pending.clear();
      this.dirty = false;
      return "ok";
    } catch (err) {
      console.error(err);
      return "fail";
    }
  }

  create(draft: { name: string; category: AssetCategory; type: AssetType; file: File }): CatalogEntry {
    const taken = new Set(this.doc.assets.map((a) => a.id));
    const id = assetIdFromName(draft.name, taken);
    const ext = extOf(draft.file.name);
    const entry: CatalogEntry = {
      id,
      name: draft.name.trim(),
      category: draft.category,
      type: draft.type,
      file: `props/${id}${ext}`,
    };
    this.doc = { ...this.doc, assets: [...this.doc.assets, entry] };
    this.pending.set(id, draft.file);
    this.extra.set(id, URL.createObjectURL(draft.file));
    this.dirty = true;
    return entry;
  }

  useProject(): void {
    this.revokeExtras();
    this.doc = projectCatalogue();
    this.source = { kind: "project", path: PROJECT_CATALOG_PATH };
    this.dir = null;
    this.pending.clear();
    this.dirty = false;
  }

  private async linkFolderIfNeeded(): Promise<void> {
    const missing = this.doc.assets.some((a) => !projectMeshUrl(a.file) && !this.extra.has(a.id));
    if (!missing) return;
    const dir = await pickCatalogueDir();
    if (!dir) return;
    this.dir = dir;
    this.source = { kind: "file", path: `${dir.name}/catalog.json` };
    for (const asset of this.doc.assets) {
      if (this.extra.has(asset.id) || projectMeshUrl(asset.file)) continue;
      const file = await readDirFile(dir, asset.file);
      if (file) this.extra.set(asset.id, URL.createObjectURL(file));
    }
  }

  private revokeExtras(): void {
    for (const url of this.extra.values()) URL.revokeObjectURL(url);
    this.extra.clear();
  }
}

function extOf(name: string): string {
  const m = name.match(/\.(gltf|glb)$/i);
  return m ? m[0].toLowerCase() : ".gltf";
}

