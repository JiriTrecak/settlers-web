# Assets

Loads pictures (and later sounds). The engine never sees original `.dat` / `.map`.

## Purpose

Dumped graphics answer: given an `ImageRef`, give me a Pixi `Texture` (and metadata: width, height, offsetX, offsetY).

Original S3 art is copyrighted. Conversion lives in `original_conv/`. Shipping uses our own atlas. Same keys.

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

/** Our PNG atlas + JSON, same ImageRef keys. */
class AtlasAssetSource implements AssetSource { /* ... */ }
```

Settler animation lookup is a function:

```ts
function settlerSprite(args: {
  civilization: Civilization;
  type: MovableType;
  material: Material;
  direction: Direction;
  action: MovableAction;
}): { ref: ImageRef; start: number; frames: number }
```

Data comes from `movables-*.txt` dumped into JSON.

## DAT format (conversion only)

Little-endian. Typical layout:

| Offset | What |
|---|---|
| 0–47 | Signature / padding |
| 48–51 | File size |
| 56–59 | Landscape sequence pointer table |
| 64–67 | Settler/building sequence pointer table |
| 68–71 | Torso pointer table |

Then: sequences of RLE-ish compressed bitmaps, RGB555 or RGB565 depending on filename suffix. Each frame has width/height/offset.

Decoder lives in `original_conv/dat/`:

```
original_conv/dat/
  parseDat.ts      // pointer tables
  decodeBitmap.ts  // pixels → RGBA Uint8Array
  types.ts
```

Output RGBA, packed into our 1024 atlas (`atlasPositions.ts`, 32px grid). Mesh wants one bind.

## Dual pipeline

```
AssetSource
  └─ AtlasAssetSource   dumped PNG + catalog.json
                        original_conv/dump-graphics.ts builds it offline
```

`ImageRef` must be stable. If DAT file `10`, sequence `3`, frame `2` is a bearer walking east, the atlas JSON has the same key (`original_FILE_SETTLER_SEQ_FRAME` strings).

## Phase 0

- Types: `ImageRef` lives in `shared`
- No parser in `src`

## Phase 2

- Identify `siedler3_XX.*.dat` files in conversion (RGB555 vs RGB565)
- Decode landscape + settler sequences
- Build landscape atlas
- Unit tests with a **tiny fixture** `.dat` snippet we author (not ripped S3 data)

## Phase 3

- Enough sequences to draw map decorations (trees, stones) from the dump
- Map loading is sim's job; graphics only provides textures

## Phase 4

- `settlerSprite()` for bearer walk, 6 directions
- Torso optional

## Later

- GUI graphics for HTML (export PNGs, don't draw GUI in Pixi)
- `SND/` / music (Web Audio). Separate `SoundSource`. Not Phase 0–4.

## Refusals

- Shipping original S3 pixels in the git repo or in a public build.
- `src` importing `original_conv`.
- Keeping settlers as raw DAT blits on CPU every frame. Decode once → GPU texture.
- Inventing a new addressing scheme that doesn't round-trip the existing atlas JSON keys.
