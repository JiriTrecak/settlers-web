# Assets

Loads pictures (and later sounds). Two backends, one address space.

## Purpose

`src/assets` answers: given an `ImageRef`, give me a Pixi `Texture` (and metadata: width, height, offsetX, offsetY).

Original S3 art is copyrighted. Dev uses a dropped `GFX/` folder. Shipping uses our own atlas. Same keys.

Never commit `GFX/`, `SND/`, or original `MAP/` binaries.

## Public API (target)

```ts
type ImageKind = "settler" | "gui" | "landscape";

type ImageRef = {
  file: number;
  kind: ImageKind;
  sequence: number;
  frame: number;
};

type ImageMeta = {
  texture: Texture;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
};

interface AssetSource {
  get(ref: ImageRef): ImageMeta | null;
  ready: boolean;
}

/** Folder-drop GFX/. Parses .dat on demand. */
class DatAssetSource implements AssetSource { /* ... */ }

/** Our PNG atlas + JSON, same ImageRef keys. */
class AtlasAssetSource implements AssetSource { /* ... */ }
```

Settler animation lookup is **not** a 5D Java array. It's a function:

```ts
function settlerSprite(args: {
  civilization: Civilization;
  type: MovableType;
  material: Material;
  direction: Direction;
  action: MovableAction;
}): { ref: ImageRef; start: number; frames: number }
```

Data comes from porting `movables-*.txt` into JSON. Spec: [`SettlerImageMap.java`](../../../SettlersJava/jsettlers.graphics/src/main/java/jsettlers/graphics/map/draw/settlerimages/SettlerImageMap.java), resources `movables-ROMAN.txt` etc.

## DAT format

Spec: header comment in [`AdvancedDatFileReader.java`](../../../SettlersJava/jsettlers.graphics/src/main/java/jsettlers/graphics/image/reader/AdvancedDatFileReader.java).

Little-endian. Typical layout:

| Offset | What |
|---|---|
| 0–47 | Signature / padding |
| 48–51 | File size |
| 56–59 | Landscape sequence pointer table |
| 64–67 | Settler/building sequence pointer table |
| 68–71 | Torso pointer table |

Then: sequences of RLE-ish compressed bitmaps, RGB555 or RGB565 depending on filename suffix (Java `DatFileType`). Each frame has width/height/offset.

Port the **decoder**, not the class hierarchy (`DatBitmapTranslator`, `SettlerTranslator`, `TorsoTranslator`, …). One module:

```
src/assets/dat/
  parseDat.ts      // pointer tables
  decodeBitmap.ts  // pixels → RGBA Uint8Array
  types.ts
```

Output RGBA. Pixi `Texture.from({ resource: { source: ImageData } })` or upload via `BufferSource`.

Landscape frames also get packed into the 1024 atlas layout Java uses (`Background` texture grid). Either:

- pack at load time into one atlas texture (do this), or
- UV-map each tile to its own texture (don't — mesh wants one bind).

## Dual pipeline

```
AssetSource
  ├─ DatAssetSource     Phase 2. Browser. User-supplied GFX.
  └─ AtlasAssetSource   Phase 2 stub, real when we have replacement art.
                        tools/dump-dat.ts builds the atlas offline from GFX
                        so we can also use it as a cache in dev.
```

`ImageRef` must be stable across backends. If DAT file `10`, sequence `3`, frame `2` is a bearer walking east, the atlas JSON has the same key.

## Phase 0

- `src/assets/index.ts` exports a `NullAssetSource` that always returns `null`
- No parser
- Types: `ImageRef`, `AssetSource` live in `shared` or `assets` — prefer `src/assets/types.ts` and re-export; `ImageRef` is needed by render/sim views so put the **type** in `shared`

## Phase 2

- Directory picker / drop of `GFX/`
- Identify `siedler3_XX.*.dat` files, including RGB555 vs RGB565
- Decode landscape + settler sequences
- Build landscape atlas
- `get()` works for those
- Unit tests with a **tiny fixture** `.dat` snippet if we can legally craft one; otherwise test pointer-table parsing against a checked-in hex fixture we author ourselves (not ripped S3 data)

## Phase 3

- Enough sequences to draw map decorations (trees, stones) from DAT
- `MAP/` loading is sim's job; assets only provides textures

## Phase 4

- `settlerSprite()` for bearer walk, 6 directions
- Torso optional

## Later

- GUI graphics for HTML (export PNGs, don't draw GUI in Pixi)
- `SND/` / music (Web Audio). Separate `SoundSource`. Not Phase 0–4.
- `tools/dump-dat.ts`: Node script, reads GFX from disk, writes `public/atlas/`

## Spec pointers

- `AdvancedDatFileReader.java` — format, lazy sequence reads
- `DatFileType.java` — 555 vs 565
- `ImageProvider.java` — file index → reader. We don't need a singleton; `DatAssetSource` holds a `Map<number, DatFile>`
- `SettlerImageMap.java` + `movables-*.txt`
- `linkmap.txt` — GUI / building image links
- `TEXTURES.md` in Java repo — replacement-art tracking; we'll have our own later

## Refusals

- Shipping original S3 pixels in the git repo or in a public build.
- Porting `ByteReader` as a Java clone. Use `DataView` on an `ArrayBuffer`.
- `RandomAccessFile`.
- Keeping settlers as raw DAT blits on CPU every frame. Decode once → GPU texture.
- Inventing a new addressing scheme that doesn't round-trip to Java's `original_FILE_SETTLER_SEQ_FRAME` strings. Those strings are useful as atlas JSON keys.
