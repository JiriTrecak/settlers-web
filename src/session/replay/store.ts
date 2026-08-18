/**
 * Local replay shelf. Newest first. Drops the oldest when the cap or quota hits.
 */
import { parseReplayList, type ReplayFile } from "./replay";

const KEY = "settlers.replays.v1";
const CAP = 24;

export class ReplayStore {
  constructor(private readonly storage: Pick<Storage, "getItem" | "setItem"> = localStorage) {}

  list(): ReplayFile[] {
    try {
      const raw: unknown = JSON.parse(this.storage.getItem(KEY) ?? "[]");
      return parseReplayList(raw);
    } catch {
      return [];
    }
  }

  get(id: string): ReplayFile | null {
    return this.list().find((f) => f.id === id) ?? null;
  }

  save(file: ReplayFile): void {
    const next = [file, ...this.list().filter((f) => f.id !== file.id)].slice(0, CAP);
    this.write(next);
  }

  remove(id: string): void {
    this.write(this.list().filter((f) => f.id !== id));
  }

  private write(files: ReplayFile[]): void {
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
