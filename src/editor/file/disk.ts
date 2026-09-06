/**
 * Browser text files. Chromium file picker when it exists; download / `<input type=file>` otherwise.
 */
import { UTCMAP_EXT } from "../../shared";

export type DiskHandle = {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
};

export type DiskText = { handle: DiskHandle | null; name: string; text: string };

const TYPE = {
  description: "Under the Canopy map",
  accept: { "application/json": [UTCMAP_EXT] },
};

const PICKER_ID = "utcmap";

type PickerWindow = Window & {
  showSaveFilePicker?: (opts: {
    suggestedName?: string;
    id?: string;
    startIn?: DiskHandle;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<DiskHandle>;
  showOpenFilePicker?: (opts: {
    multiple?: boolean;
    id?: string;
    startIn?: DiskHandle;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<DiskHandle[]>;
};

export async function writeText(
  handle: DiskHandle | null,
  name: string,
  text: string,
  opts?: { pick?: boolean; startIn?: DiskHandle | null },
): Promise<{ handle: DiskHandle | null; name: string } | undefined> {
  if (handle && !opts?.pick) {
    try {
      const stream = await handle.createWritable();
      await stream.write(text);
      await stream.close();
      return { handle, name };
    } catch (err) {
      if (aborted(err)) return undefined;
      if (!stale(err)) throw err;
    }
  }
  return pickSave(name, text, opts?.startIn ?? handle);
}

export async function readText(startIn?: DiskHandle | null): Promise<DiskText | undefined> {
  const w = window as PickerWindow;
  if (w.showOpenFilePicker) {
    try {
      const [handle] = await w.showOpenFilePicker({
        id: PICKER_ID,
        types: [TYPE],
        startIn: startIn ?? undefined,
      });
      if (!handle) return undefined;
      return { handle, name: handle.name, text: await (await handle.getFile()).text() };
    } catch (err) {
      if (aborted(err)) return undefined;
      throw err;
    }
  }
  return pickOpenFallback();
}

async function pickSave(
  name: string,
  text: string,
  startIn?: DiskHandle | null,
): Promise<{ handle: DiskHandle | null; name: string } | undefined> {
  const w = window as PickerWindow;
  if (w.showSaveFilePicker) {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: name,
        id: PICKER_ID,
        types: [TYPE],
        startIn: startIn ?? undefined,
      });
      const stream = await handle.createWritable();
      await stream.write(text);
      await stream.close();
      return { handle, name: handle.name || name };
    } catch (err) {
      if (aborted(err)) return undefined;
      throw err;
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
  return { handle: null, name };
}

function pickOpenFallback(): Promise<DiskText | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = `${UTCMAP_EXT},application/json`;
    input.hidden = true;
    const finish = (value: DiskText | undefined): void => {
      input.remove();
      resolve(value);
    };
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) {
        finish(undefined);
        return;
      }
      void file.text().then((text) => finish({ handle: null, name: file.name, text }));
    });
    input.addEventListener("cancel", () => finish(undefined));
    document.body.append(input);
    input.click();
  });
}

function aborted(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function stale(err: unknown): boolean {
  return err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "NotFoundError");
}
