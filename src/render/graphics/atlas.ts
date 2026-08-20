/**
 * Civ-paged sprite atlases. Pages are GPU textures; catalog paths become frame rects.
 * Landscape stays on its own wrap atlas. Missing manifest → loose PNGs.
 */
import { Rectangle, Texture } from "pixi.js";
import { currentLoadWatch, loadNote } from "./loadWatch";

const BASE = `${import.meta.env.BASE_URL}graphics/`;

export type AtlasManifest = {
  size: number;
  pad: number;
  pages: { file: string; pack: string; frames: number; fill: number }[];
  frames: Record<string, { page: number; x: number; y: number; w: number; h: number }>;
};

const frames = new Map<string, Texture>();
const loadedPacks = new Set<string>();
let manifest: AtlasManifest | null = null;
let manifestP: Promise<AtlasManifest | null> | null = null;

/** Shared pages + each civ's buildings/settlers. */
export function atlasPacksForCivs(civs: readonly string[]): string[] {
  const out = ["props"];
  const seen = new Set(out);
  const add = (p: string) => {
    if (seen.has(p)) return;
    seen.add(p);
    out.push(p);
  };
  add("settlers-shared");
  for (const civ of civs) {
    add(`buildings-${civ}`);
    add(`settlers-${civ}`);
  }
  return out;
}

/** Sub-texture for a catalog PNG path, if that pack is loaded. */
export function atlasTexture(rel: string): Texture | undefined {
  return frames.get(rel);
}

async function fetchManifest(): Promise<AtlasManifest | null> {
  manifestP ??= (async () => {
    try {
      const res = await fetch(`${BASE}atlases/manifest.json`);
      if (!res.ok) return null;
      return (await res.json()) as AtlasManifest;
    } catch {
      return null;
    }
  })();
  manifest = await manifestP;
  return manifest;
}

/** Decode atlas pages for `packs`. Already-loaded packs are skipped. */
export async function loadAtlases(packs: readonly string[]): Promise<boolean> {
  const want = packs.filter((p) => !loadedPacks.has(p));
  if (want.length === 0 && frames.size > 0) return true;
  const man = await fetchManifest();
  if (!man) return false;
  const wantSet = new Set(want);
  const pageIx: number[] = [];
  for (let i = 0; i < man.pages.length; i++) {
    if (wantSet.has(man.pages[i]!.pack)) pageIx.push(i);
  }
  if (pageIx.length === 0) {
    for (const p of want) loadedPacks.add(p);
    return true;
  }
  const pageTex: Texture[] = new Array(man.pages.length);
  await Promise.all(
    pageIx.map(async (i) => {
      const page = man.pages[i]!;
      loadNote(`atlas · ${page.file}`);
      const tex = await decodePage(`atlases/${page.file}`);
      if (tex) pageTex[i] = tex;
    }),
  );
  for (const [rel, f] of Object.entries(man.frames)) {
    if (frames.has(rel)) continue;
    const page = pageTex[f.page];
    if (!page) continue;
    const tex = new Texture({
      source: page.source,
      frame: new Rectangle(f.x, f.y, f.w, f.h),
    });
    frames.set(rel, tex);
  }
  for (const p of want) loadedPacks.add(p);
  return true;
}

async function decodePage(rel: string): Promise<Texture | null> {
  currentLoadWatch()?.expectPath(rel);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = BASE + rel;
    await img.decode();
    const texture = Texture.from(img);
    texture.source.autoGenerateMipmaps = false;
    texture.source.scaleMode = "nearest";
    texture.source.addressMode = "clamp-to-edge";
    currentLoadWatch()?.tick(rel);
    return texture;
  } catch {
    currentLoadWatch()?.tick(rel);
    return null;
  }
}
