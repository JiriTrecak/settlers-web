/**
 * Local save shelf. Newest first. Drops the oldest when the cap or quota hits.
 */
import { parseSaveList, type SaveFile } from "./save";

const KEY = "settlers.saves.v1";
const CAP = 24;

export class SaveStore {
  constructor(private readonly storage: Pick<Storage, "getItem" | "setItem"> = localStorage) {}

  list(): SaveFile[] {
    try {
      const raw: unknown = JSON.parse(this.storage.getItem(KEY) ?? "[]");
      return parseSaveList(raw);
    } catch {
      return [];
    }
  }

  get(id: string): SaveFile | null {
    return this.list().find((f) => f.id === id) ?? null;
  }

  save(file: SaveFile): void {
    const next = [file, ...this.list().filter((f) => f.id !== file.id)].slice(0, CAP);
    this.write(next);
  }

  remove(id: string): void {
    this.write(this.list().filter((f) => f.id !== id));
  }

  private write(files: SaveFile[]): void {
    let keep = files;
    for (;;) {
      try {
        this.storage.setItem(KEY, JSON.stringify(keep));
        return;
      } catch {
        if (keep.length <= 1) return;
        keep = keep.slice(0, -1);
      }
    }
  }
}
