/**
 * Last `.utcmap` handle in IndexedDB so the next picker opens that folder.
 */
import type { DiskHandle } from "./disk";

const DB_NAME = "utc-editor";
const STORE = "recent";
const KEY = "map";

export type RecentMap = { handle: DiskHandle | null; name: string };

export async function rememberMap(recent: RecentMap): Promise<void> {
  try {
    const db = await openDb();
    await txDone(db, "readwrite", (store) => store.put(recent, KEY));
    db.close();
  } catch {
    /* private mode */
  }
}

export async function recallMap(): Promise<RecentMap | undefined> {
  try {
    const db = await openDb();
    const recent = await txGet(db);
    db.close();
    return recent;
  } catch {
    return undefined;
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    run(tx.objectStore(STORE));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function txGet(db: IDBDatabase): Promise<RecentMap | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result as RecentMap | undefined);
    req.onerror = () => reject(req.error);
  });
}
