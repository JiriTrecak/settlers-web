/**
 * Save / load the current `UtcMap` as a `.utcmap` file.
 * Handle is only set after a save/load this session — restore is startIn only.
 */
import { mapFileName, parseUtcMap, stringifyUtcMap, type UtcMap } from "../../shared";
import { readText, writeText, type DiskHandle } from "./disk";
import { recallMap, rememberMap } from "./recent";

export type LoadResult = { ok: true; map: UtcMap } | { ok: false; reason: "parse" } | undefined;

export class MapStore {
  private handle: DiskHandle | null = null;
  private startIn: DiskHandle | null = null;
  private fileName = "";
  private readonly ready: Promise<void>;

  constructor() {
    this.ready = this.restore();
  }

  async save(map: UtcMap, asNew = false): Promise<"ok" | "cancel" | "fail"> {
    await this.ready;
    try {
      const suggested = this.handle && !asNew ? this.fileName || mapFileName(map.name) : mapFileName(map.name);
      const next = await writeText(this.handle, suggested, stringifyUtcMap(map), {
        pick: asNew,
        startIn: this.startIn ?? this.handle,
      });
      if (!next) return "cancel";
      this.keep(next.handle, next.name);
      return "ok";
    } catch (err) {
      console.error(err);
      return "fail";
    }
  }

  async load(): Promise<LoadResult> {
    await this.ready;
    let picked;
    try {
      picked = await readText(this.startIn ?? this.handle);
    } catch (err) {
      console.error(err);
      return { ok: false, reason: "parse" };
    }
    if (!picked) return undefined;
    let raw: unknown;
    try {
      raw = JSON.parse(picked.text);
    } catch {
      return { ok: false, reason: "parse" };
    }
    const map = parseUtcMap(raw);
    if (!map) return { ok: false, reason: "parse" };
    this.keep(picked.handle, picked.name);
    return { ok: true, map };
  }

  clearFile(): void {
    this.handle = null;
    this.fileName = "";
  }

  private keep(handle: DiskHandle | null, name: string): void {
    this.handle = handle;
    this.startIn = handle ?? this.startIn;
    this.fileName = name;
    void rememberMap({ handle, name });
  }

  private async restore(): Promise<void> {
    const recent = await recallMap();
    if (!recent) return;
    this.startIn = recent.handle;
  }
}
