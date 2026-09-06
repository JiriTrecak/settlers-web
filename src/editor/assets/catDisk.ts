/**
 * Catalogue folder on disk. `catalog.json` plus relative mesh files.
 */
import type { Catalogue } from "../../shared";
import { stringifyCatalogue } from "../../shared";

export type DirHandle = {
  name: string;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<DirHandle>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<{
    name: string;
    getFile(): Promise<File>;
    createWritable(): Promise<{ write(data: BufferSource | Blob | string): Promise<void>; close(): Promise<void> }>;
  }>;
};

type PickerWindow = Window & {
  showDirectoryPicker?: (opts?: { id?: string; mode?: "read" | "readwrite" }) => Promise<DirHandle>;
  showOpenFilePicker?: (opts: {
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{ name: string; getFile(): Promise<File> }[]>;
};

export async function pickCatalogueFile(): Promise<{ name: string; text: string } | undefined> {
  const w = window as PickerWindow;
  if (w.showOpenFilePicker) {
    try {
      const [handle] = await w.showOpenFilePicker({
        types: [{ description: "Asset catalogue", accept: { "application/json": [".json"] } }],
      });
      if (!handle) return undefined;
      return { name: handle.name, text: await (await handle.getFile()).text() };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return undefined;
      throw err;
    }
  }
  return pickJsonFallback();
}

export async function pickCatalogueDir(): Promise<DirHandle | undefined> {
  const w = window as PickerWindow;
  if (!w.showDirectoryPicker) return undefined;
  try {
    return await w.showDirectoryPicker({ id: "utccat", mode: "readwrite" });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return undefined;
    throw err;
  }
}

export async function readDirFile(dir: DirHandle, rel: string): Promise<File | undefined> {
  const parts = rel.split("/").filter(Boolean);
  const name = parts.pop();
  if (!name) return undefined;
  let cur = dir;
  for (const part of parts) {
    try {
      cur = await cur.getDirectoryHandle(part);
    } catch {
      return undefined;
    }
  }
  try {
    return await (await cur.getFileHandle(name)).getFile();
  } catch {
    return undefined;
  }
}

export async function writeCatalogueDir(
  dir: DirHandle,
  doc: Catalogue,
  files: ReadonlyMap<string, Blob>,
): Promise<void> {
  const json = await dir.getFileHandle("catalog.json", { create: true });
  const stream = await json.createWritable();
  await stream.write(stringifyCatalogue(doc));
  await stream.close();
  for (const [rel, blob] of files) {
    await writeRel(dir, rel, blob);
  }
}

async function writeRel(dir: DirHandle, rel: string, data: Blob): Promise<void> {
  const parts = rel.split("/").filter(Boolean);
  const name = parts.pop();
  if (!name) return;
  let cur = dir;
  for (const part of parts) cur = await cur.getDirectoryHandle(part, { create: true });
  const file = await cur.getFileHandle(name, { create: true });
  const stream = await file.createWritable();
  await stream.write(data);
  await stream.close();
}

function pickJsonFallback(): Promise<{ name: string; text: string } | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.hidden = true;
    const finish = (value: { name: string; text: string } | undefined): void => {
      input.remove();
      resolve(value);
    };
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) {
        finish(undefined);
        return;
      }
      void file.text().then((text) => finish({ name: file.name, text }));
    });
    input.addEventListener("cancel", () => finish(undefined));
    document.body.append(input);
    input.click();
  });
}
