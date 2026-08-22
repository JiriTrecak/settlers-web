/**
 * Dump GFX/*.dat into assets/graphics/ as named PNGs + catalog.json.
 * Run: npm run dump:graphics
 */
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DatArchive, packLandscapeAtlas, parseDatFileName, type DecodedImage, type SeqKind } from "./dat";
import { encodePng } from "./png";
import { clipPath, framesOf, loadAllMovableClips } from "./catalog/movables";
import { landscapeInfo } from "../src/shared/landscape/landscape";
import type { BuildingEntry } from "./catalog/types";
import type { Category, LayerRef, Sprite } from "./catalog/sprite";
import { ORIGINAL_GFX, REPO_ROOT } from "./original";

const ROOT = REPO_ROOT;
const GFX = ORIGINAL_GFX;
const OUT = join(ROOT, "assets/graphics");
const MOVABLES = join(ROOT, "original_conv/catalog/movables");

type Job = {
  id: string;
  category: Category;
  title: string;
  subtitle: string;
  tags: string[];
  group?: string;
  variant?: string;
  frame?: number;
  frames?: number;
  file: number;
  kind: SeqKind;
  sequence: number;
  frameIndex: number;
  rel: string;
};

const jobs: Job[] = [];
const claimed = new Set<string>();

function claim(file: number, kind: string, seq: number, frame: number): void {
  claimed.add(`${file}:${kind}:${seq}:${frame}`);
}

function add(job: Job): void {
  jobs.push(job);
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, "0");
}

function slug(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "-");
}

function layerOf(rel: string, img: DecodedImage): LayerRef {
  return {
    path: `${rel}.png`,
    width: img.width,
    height: img.height,
    offsetX: img.offsetX,
    offsetY: img.offsetY,
  };
}

const buildingsJson = JSON.parse(await readFile(join(ROOT, "original_conv/catalog/buildings.json"), "utf8")) as {
  buildings: BuildingEntry[];
};

for (const b of buildingsJson.buildings) {
  const dump = (refs: { file: number; kind: string; sequence: number; frame: number }[], state: string): void => {
    refs.forEach((ref, i) => {
      const many = refs.length > 1;
      const rel = `buildings/${b.civ}/${b.building}/${state}${many ? `/${pad(i)}` : ""}`;
      add({
        id: `${b.id}/${state}${many ? `/${i}` : ""}`,
        category: "buildings",
        title: b.building.replace(/_/g, " "),
        subtitle: `${b.civ} · ${state}`,
        tags: ["building", b.civ, b.building, state],
        group: `buildings/${b.civ}/${b.building}`,
        variant: state,
        frame: many ? i : undefined,
        frames: many ? refs.length : undefined,
        file: ref.file,
        kind: ref.kind as SeqKind,
        sequence: ref.sequence,
        frameIndex: ref.frame,
        rel,
      });
    });
  };
  dump(b.built, "built");
  dump(b.scaffold, "scaffold");
  if (b.gui) dump([b.gui], "gui");
}

const clips = await loadAllMovableClips(MOVABLES);
const seenClip = new Set<string>();
for (const clip of clips) {
  const dir = clipPath(clip);
  const frames = framesOf(clip);
  const key = `${clip.civ}:${clip.type}:${clip.action}:${clip.material}:${clip.direction}:${clip.file}:${clip.sequence}:${clip.start}:${clip.duration}`;
  if (seenClip.has(key)) continue;
  seenClip.add(key);
  frames.forEach((frameIndex, i) => {
    add({
      id: `${dir}/${pad(i, 3)}`,
      category: "settlers",
      title: `${clip.type.toLowerCase().replace(/_/g, " ")} ${clip.action === "NO_ACTION" ? "idle" : clip.action.toLowerCase()}`,
      subtitle: `${clip.civ} · ${clip.direction.toLowerCase().replace(/_/g, "-")} · ${clip.material === "NO_MATERIAL" || clip.material === "*" ? "empty" : clip.material.toLowerCase()}`,
      tags: ["settler", clip.civ, clip.type, clip.action, clip.material, clip.direction].map((t) => t.toLowerCase()),
      group: dir,
      frame: i,
      frames: frames.length,
      file: clip.file,
      kind: "settler",
      sequence: clip.sequence,
      frameIndex,
      rel: `${dir}/${pad(i, 3)}`,
    });
  });
}

const landDone = new Map<number, string>();
for (const [name, info] of Object.entries(landscapeInfo)) {
  let rel = landDone.get(info.atlasSlot);
  if (!rel) {
    rel = `landscape/${name}`;
    landDone.set(info.atlasSlot, rel);
  }
  add({
    id: `landscape/${name}`,
    category: "landscape",
    title: name,
    subtitle: `slot ${info.atlasSlot}`,
    tags: ["landscape", name],
    file: 0,
    kind: "landscape",
    sequence: info.atlasSlot,
    frameIndex: 0,
    rel,
  });
}

const props: Array<{ title: string; file: number; seq: number }> = [
  { title: "tree 1", file: 1, seq: 1 },
  { title: "tree 2", file: 1, seq: 2 },
  { title: "tree 3", file: 1, seq: 4 },
  { title: "tree 4", file: 1, seq: 7 },
  { title: "tree 5", file: 1, seq: 8 },
  { title: "tree 6", file: 1, seq: 16 },
  { title: "tree 7", file: 1, seq: 17 },
  { title: "tree fall 1", file: 1, seq: 3 },
  { title: "tree fall 2", file: 1, seq: 6 },
  { title: "tree fall 3", file: 1, seq: 9 },
  { title: "tree fall 4", file: 1, seq: 18 },
  { title: "tree medium", file: 1, seq: 11 },
  { title: "tree small", file: 1, seq: 12 },
  { title: "tree sapling", file: 1, seq: 22 },
  { title: "corn", file: 1, seq: 23 },
  { title: "rice", file: 1, seq: 24 },
  { title: "wine", file: 1, seq: 25 },
  { title: "waves", file: 1, seq: 26 },
  { title: "stone", file: 1, seq: 31 },
  { title: "stack plank", file: 1, seq: 33 },
  { title: "stack trunk", file: 1, seq: 41 },
  { title: "stack stone", file: 1, seq: 43 },
  { title: "stack axe", file: 1, seq: 46 },
  { title: "stack hammer", file: 1, seq: 51 },
  { title: "stack pick", file: 1, seq: 53 },
  { title: "stack saw", file: 1, seq: 54 },
  { title: "stack blade", file: 1, seq: 55 },
  { title: "stack ironore", file: 1, seq: 39 },
  { title: "stack goldore", file: 1, seq: 36 },
  { title: "stack coal", file: 1, seq: 34 },
  { title: "stack crop", file: 1, seq: 50 },
  { title: "stack flour", file: 1, seq: 48 },
  { title: "stack bread", file: 1, seq: 49 },
  { title: "stack fish", file: 1, seq: 47 },
  { title: "stack meat", file: 1, seq: 52 },
  { title: "stack pig", file: 1, seq: 73 },
  { title: "stack water", file: 1, seq: 77 },
  { title: "stack scythe", file: 1, seq: 56 },
  { title: "stack fishingrod", file: 1, seq: 66 },
  { title: "pig", file: 6, seq: 0 },
  { title: "fish", file: 6, seq: 7 },
  { title: "hive empty", file: 6, seq: 8 },
  { title: "flag door", file: 13, seq: 63 },
  { title: "flag roof", file: 13, seq: 64 },
  { title: "border", file: 13, seq: 65 },
  { title: "work area", file: 1, seq: 91 },
  { title: "site post", file: 1, seq: 92 },
  { title: "site sign", file: 1, seq: 93 },
  { title: "found coal", file: 1, seq: 94 },
  { title: "found gems", file: 1, seq: 95 },
  { title: "found gold", file: 1, seq: 96 },
  { title: "found iron", file: 1, seq: 97 },
  { title: "found brimstone", file: 1, seq: 98 },
  { title: "found nothing", file: 1, seq: 99 },
  { title: "health", file: 4, seq: 6 },
  { title: "select mark", file: 4, seq: 7 },
];

for (const p of props) {
  add({
    id: `props/${slug(p.title)}/000`,
    category: "props",
    title: p.title,
    subtitle: "",
    tags: ["prop", slug(p.title)],
    group: `props/${slug(p.title)}`,
    frame: 0,
    file: p.file,
    kind: "settler",
    sequence: p.seq,
    frameIndex: 0,
    rel: `props/${slug(p.title)}/000`,
  });
}

if (!existsSync(GFX)) {
  console.error(`missing ${GFX} — extract S3 first (original_conv/extract-s3.sh)`);
  process.exit(1);
}

const names = (await readdir(GFX)).filter((n) => parseDatFileName(n));
const byIndex = new Map<number, { name: string; color: "rgb555" | "rgb565" }>();
for (const name of names) {
  const parsed = parseDatFileName(name)!;
  const prev = byIndex.get(parsed.fileIndex);
  if (prev?.color === "rgb565" && parsed.color === "rgb555") continue;
  byIndex.set(parsed.fileIndex, { name, color: parsed.color });
}

console.log(`jobs ${jobs.length} · dat files ${byIndex.size}`);
await mkdir(OUT, { recursive: true });

const archives = new Map<number, DatArchive>();
async function archive(file: number): Promise<DatArchive | null> {
  const hit = archives.get(file);
  if (hit) return hit;
  const meta = byIndex.get(file);
  if (!meta) return null;
  const buf = await readFile(join(GFX, meta.name));
  const dat = new DatArchive(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), meta.color, file, meta.name);
  archives.set(file, dat);
  return dat;
}

async function writeImg(rel: string, img: DecodedImage): Promise<void> {
  if (img.width === 0 || img.height === 0) return;
  const abs = join(OUT, `${rel}.png`);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, encodePng(img.width, img.height, img.rgba));
}

function layer(dat: DatArchive, kind: "torso" | "shadow", seq: number, frame: number): DecodedImage | null {
  const img = dat.decode(kind, seq, frame);
  return img.width > 0 ? img : null;
}

function toSprite(job: Job, img: DecodedImage, torso?: LayerRef, shadow?: LayerRef): Sprite {
  return {
    id: job.id,
    category: job.category,
    title: job.title,
    subtitle: job.subtitle,
    tags: job.tags,
    group: job.group,
    variant: job.variant,
    frame: job.frame,
    frames: job.frames,
    path: `${job.rel}.png`,
    torso,
    shadow,
    width: img.width,
    height: img.height,
    offsetX: img.offsetX,
    offsetY: img.offsetY,
  };
}

const sprites: Sprite[] = [];
let done = 0;
for (const job of jobs) {
  const dat = await archive(job.file);
  if (!dat) continue;

  if (job.group?.startsWith("props/") && job.frame === 0 && job.frames === undefined) {
    const n = dat.frameCount("settler", job.sequence);
    for (let i = 0; i < n; i++) {
      const frame = dat.decode("settler", job.sequence, i);
      if (frame.width === 0) continue;
      const rel = `props/${slug(job.title)}/${pad(i, 3)}`;
      await writeImg(rel, frame);
      const t = layer(dat, "torso", job.sequence, i);
      const s = layer(dat, "shadow", job.sequence, i);
      if (t) await writeImg(`${rel}.torso`, t);
      if (s) await writeImg(`${rel}.shadow`, s);
      claim(job.file, "settler", job.sequence, i);
      sprites.push({
        id: `props/${slug(job.title)}/${pad(i, 3)}`,
        category: "props",
        title: job.title,
        subtitle: n > 1 ? `frame ${i + 1}/${n}` : "",
        tags: job.tags,
        group: `props/${slug(job.title)}`,
        frame: i,
        frames: n,
        path: `${rel}.png`,
        torso: t ? layerOf(`${rel}.torso`, t) : undefined,
        shadow: s ? layerOf(`${rel}.shadow`, s) : undefined,
        width: frame.width,
        height: frame.height,
        offsetX: frame.offsetX,
        offsetY: frame.offsetY,
      });
    }
    done++;
    if (done % 500 === 0) console.log(`dumped ${done}/${jobs.length}`);
    continue;
  }

  const img =
    job.kind === "landscape"
      ? dat.decode("landscape", job.sequence, 0)
      : job.kind === "gui"
        ? dat.decode("gui", job.sequence, job.frameIndex)
        : dat.decode("settler", job.sequence, job.frameIndex);
  if (img.width === 0) continue;

  await writeImg(job.rel, img);
  claim(job.file, job.kind, job.sequence, job.frameIndex);
  let torso: LayerRef | undefined;
  let shadow: LayerRef | undefined;
  if (job.kind === "settler") {
    const t = layer(dat, "torso", job.sequence, job.frameIndex);
    const s = layer(dat, "shadow", job.sequence, job.frameIndex);
    if (t) {
      torso = layerOf(`${job.rel}.torso`, t);
      await writeImg(`${job.rel}.torso`, t);
    }
    if (s) {
      shadow = layerOf(`${job.rel}.shadow`, s);
      await writeImg(`${job.rel}.shadow`, s);
    }
  }
  sprites.push(toSprite(job, img, torso, shadow));
  done++;
  if (done % 500 === 0) console.log(`dumped ${done}/${jobs.length}`);
}

for (const [file, meta] of byIndex) {
  const dat = await archive(file);
  if (!dat) continue;
  const kinds: SeqKind[] = ["settler", "landscape", "gui"];
  for (const kind of kinds) {
    const n = dat.counts()[kind];
    for (let seq = 0; seq < n; seq++) {
      const frames = dat.frameCount(kind, seq);
      for (let frame = 0; frame < frames; frame++) {
        if (claimed.has(`${file}:${kind}:${seq}:${frame}`)) continue;
        const img = dat.decode(kind, seq, frame);
        if (img.width === 0) continue;
        const rel = `uncatalogued/${kind}/${pad(file)}/${pad(seq, 3)}/${pad(frame, 3)}`;
        await writeImg(rel, img);
        let torso: LayerRef | undefined;
        let shadow: LayerRef | undefined;
        if (kind === "settler") {
          const t = layer(dat, "torso", seq, frame);
          const s = layer(dat, "shadow", seq, frame);
          if (t) {
            torso = layerOf(`${rel}.torso`, t);
            await writeImg(`${rel}.torso`, t);
          }
          if (s) {
            shadow = layerOf(`${rel}.shadow`, s);
            await writeImg(`${rel}.shadow`, s);
          }
        }
        sprites.push({
          id: `uncatalogued/${kind}/${pad(file)}/${pad(seq, 3)}/${pad(frame, 3)}`,
          category: "uncatalogued",
          title: `${kind} ${file}.${seq}.${frame}`,
          subtitle: meta.name,
          tags: ["uncatalogued", kind, String(file)],
          group: `uncatalogued/${kind}/${pad(file)}/${pad(seq, 3)}`,
          frame,
          frames,
          path: `${rel}.png`,
          torso,
          shadow,
          width: img.width,
          height: img.height,
          offsetX: img.offsetX,
          offsetY: img.offsetY,
        });
      }
    }
  }
  console.log(`file ${pad(file)} done`);
}

const landDat = await archive(0);
if (landDat) {
  const n = landDat.counts().landscape;
  const tiles = Array.from({ length: n }, (_, i) => landDat.decode("landscape", i, 0));
  await writeImg("landscape-atlas", packLandscapeAtlas(tiles));
  console.log(`landscape atlas ${n} tiles`);
}

sprites.sort((a, b) => a.id.localeCompare(b.id));
await writeFile(join(OUT, "catalog.json"), JSON.stringify({ sprites }));
console.log(`wrote ${sprites.length} sprites → ${OUT}`);
