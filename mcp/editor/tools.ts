import { actionSchema } from "../../src/shared/types/types";
import { placementSchema } from "../../src/content/schema";
/**
 * Mastra tools → EditorHub ops. Add a createTool here when you add an EditorControl op.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { EditorHub } from "./hub";

const SHOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../tmp/editor-shot.jpg",
);

function writeShot(
  data: string,
  mime: string,
  metadata: Record<string, unknown>,
): void {
  const ext = mime.includes("png") ? "png" : "jpg";
  const path = ext === "png" ? SHOT.replace(/\.jpg$/, ".png") : SHOT;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.from(data, "base64"));
  writeFileSync(
    join(dirname(path), "editor-shot.json"),
    JSON.stringify({ file: `editor-shot.${ext}`, ...metadata }),
  );
}

const assetId = z
  .string()
  .describe("Catalogue id, e.g. pine or synty-tree-pine-01");
const cellX = z.number().describe("Cell X. Playable 0–255, halo −16–271");
const cellY = z.number().describe("Cell Y / Z. Same range as X");

export function editorTools(hub: EditorHub) {
  const call = (op: string, params?: unknown) => hub.call(op, params);

  return {
    editor_entities: createTool({
      id: "editor_entities",
      description:
        "List gameplay definitions or authored entities; put, select or delete an explicit placement. Neutral units create authored camps. These are gameplay entities, separate from decorative stamps.",
      inputSchema: z.object({
        action: z.enum(["definitions", "list", "put", "select", "delete"]),
        placement: placementSchema.optional(),
        id: z.string().optional(),
      }),
      execute: async (input) => call("entities", input),
    }),
    editor_spawn: createTool({
      id: "editor_spawn",
      description:
        "Place or move a player spawn point in the loaded map, validating dry level terrain and separation.",
      inputSchema: z.object({
        player: z.number().int().min(1).max(8),
        x: z.number().int().min(8).max(503),
        z: z.number().int().min(8).max(503),
      }),
      execute: async (input) => call("setSpawnPoint", input),
    }),
    editor_landscape: createTool({
      id: "editor_landscape",
      description:
        "Landscape authoring: plateau (closed points outline, absolute height -16..24), ramp (points from lower to upper level, radius half-width; samples endpoint heights; keep grade <= .65), landform (elliptical hill/basin: x/z, radiusX/Z, additive height, rotation degrees, plateau 0...9, roughness 0...35, seed), curve (Catmull-Rom points x/z/radius, mode terrain/river/raise/foliage), cover (instanced meadow patch), environment (hour/season/playing), water (persisted rippleScale .01..1, rippleStrength 0...5, cloudStrength 0...2, foamStrength 0..1, causticStrength 0..1, reflectionStrength 0..1), base (height), view (grid), export, load (map), landmarks (project stamp anchors and bounds to normalized image coordinates for a given aspect and optional ids), status with renderer diagnostics. Curve radius is half-width in meters.",
      inputSchema: z.object({
        action: z.enum([
          "status",
          "curve",
          "cover",
          "environment",
          "base",
          "landform",
          "plateau",
          "ramp",
          "view",
          "export",
          "load",
          "landmarks",
          "water",
        ]),
        water: z
          .object({
            rippleScale: z.number().min(0.01).max(1).optional(),
            rippleStrength: z.number().min(0).max(0.5).optional(),
            cloudStrength: z.number().min(0).max(0.2).optional(),
            foamStrength: z.number().min(0).max(1).optional(),
            causticStrength: z.number().min(0).max(1).optional(),
            shadowStrength: z
              .number()
              .min(0)
              .max(1)
              .optional()
              .describe("Directional shadow strength on water; default .6."),
            reflectionStrength: z.number().min(0).max(1).optional(),
          })
          .optional(),
        aspect: z.number().optional(),
        ids: z.array(z.string()).optional(),
        points: z
          .array(
            z.object({
              x: z.number(),
              z: z.number(),
              radius: z.number().optional(),
            }),
          )
          .optional(),
        mode: z
          .enum(["terrain", "river", "shallows", "cover", "raise", "foliage", "smooth", "flatten"])
          .optional(),
        layer: z.enum(["grass", "sand", "road", "mud", "rock", "snow"]).optional(),
        radius: z.number().optional(),
        depth: z.number().optional(),
        opacity: z.number().optional(),
        x: z.number().optional(),
        z: z.number().optional(),
        density: z.number().optional(),
        flowers: z.number().optional(),
        grassScale: z
          .number()
          .min(0.2)
          .max(4)
          .optional()
          .describe("Grass tuft size; does not scale flowers. Default 1."),
        broadRatio: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe(
            "Fraction of broad bent-blade tufts versus upright thin tufts. Default .55.",
          ),
        palette: z
          .enum(["meadow", "straw", "ochre", "sage", "forest"])
          .optional(),
        seed: z.number().optional(),
        hour: z.number().optional(),
        season: z.enum(["spring", "summer", "autumn"]).optional(),
        playing: z.boolean().optional(),
        radiusX: z.number().optional(),
        radiusZ: z.number().optional(),
        rotation: z.number().optional(),
        plateau: z.number().optional(),
        roughness: z.number().optional(),
        height: z.number().optional(),
        grid: z.boolean().optional(),
        map: z.unknown().optional(),
      }),
      execute: async (input) => call("landscape", input),
    }),
    editor_decals: createTool({
      id: "editor_decals",
      description:
        "Edit terrain-following ground decals. List patterns and decals; place a patch at world x/z; update or delete by id; config selects the editor decal tool. Size is full width in metres, rotation in degrees, opacity 0..1. Saved in landscape.decals and follows sculpted terrain.",
      inputSchema: z.object({
        action: z.enum(["list", "place", "update", "delete", "config"]),
        id: z.string().optional(),
        kind: z.enum(["leaf-litter", "tiny-flowers", "pebbles"]).optional(),
        x: z.number().optional(),
        z: z.number().optional(),
        size: z.number().min(0.5).max(32).optional(),
        rotation: z.number().min(-360).max(360).optional(),
        opacity: z.number().min(0).max(1).optional(),
      }),
      execute: async (input) => call("decals", input),
    }),
    game_status: createTool({
      id: "game_status",
      description:
        "Read the active game simulation, resources, workers, buildings, territory and synchronization status.",
      inputSchema: z.object({}),
      execute: async () => call("gameStatus"),
    }),
    game_command: createTool({
      id: "game_command",
      description:
        "Queue a gameplay command through the active player’s lockstep channel. Does not mutate simulation directly.",
      inputSchema: z.object({ action: actionSchema }),
      execute: async (input) => call("gameCommand", input),
    }),
    game_view: createTool({
      id: "game_view",
      description:
        "Move the gameplay camera for inspection; does not change the simulation.",
      inputSchema: z.object({
        x: z.number().optional(),
        z: z.number().optional(),
        gameZoom: z.number().min(0.5).max(2).optional(),
      }),
      execute: async (input) => call("gameView", input),
    }),
    editor_status: createTool({
      id: "editor_status",
      description:
        "Editor connection, map name, stamp count, current tool/asset, camera, brush kit.",
      inputSchema: z.object({}),
      execute: async () => call("status"),
    }),

    editor_catalog: createTool({
      id: "editor_catalog",
      description:
        "Browse catalogue assets. Filter by text, category, or sit type (prop/water/span).",
      inputSchema: z.object({
        q: z.string().optional().describe("Name or id substring"),
        category: z
          .enum([
            "foliage",
            "terrain",
            "water",
            "landmark",
            "resource",
            "other",
          ])
          .optional(),
        type: z.enum(["prop", "water", "span", "ground"]).optional(),
        limit: z.number().optional(),
      }),
      execute: async (input) => call("catalog", input),
    }),

    editor_place: createTool({
      id: "editor_place",
      description:
        "Stamp one or more catalogue items. Water assets only on wet cells; land props only on dry; span anywhere. One item looks the camera there.",
      inputSchema: z.object({
        asset: assetId.optional(),
        x: cellX.optional(),
        y: cellY.optional(),
        yaw: z.number().optional().describe("Radians"),
        scale: z.number().positive().max(20).optional(),
        elevation: z.number().min(-32).max(32).optional(),
        variant: z
          .enum(["snow", "gold", "red", "green", "pink", "slate"])
          .optional(),
        snap: z
          .boolean()
          .optional()
          .describe(
            "False preserves fractional cell coordinates; default snaps to the grid.",
          ),
        items: z
          .array(
            z.object({
              asset: assetId,
              x: cellX,
              y: cellY,
              yaw: z.number().optional(),
              scale: z.number().positive().max(20).optional(),
              elevation: z.number().min(-32).max(32).optional(),
              variant: z
                .enum(["snow", "gold", "red", "green", "pink", "slate"])
                .optional(),
              snap: z
                .boolean()
                .optional()
                .describe(
                  "False preserves fractional cell coordinates; default snaps to the grid.",
                ),
            }),
          )
          .optional(),
      }),
      execute: async (input) => call("place", input),
    }),

    editor_stamps: createTool({
      id: "editor_stamps",
      description: "List placed stamps. Optional asset filter.",
      inputSchema: z.object({
        asset: assetId.optional(),
        limit: z.number().optional(),
      }),
      execute: async (input) => call("stamps", input),
    }),

    editor_select: createTool({
      id: "editor_select",
      description: "Select a stamp by id (or pass empty id to clear).",
      inputSchema: z.object({ id: z.string().optional() }),
      execute: async (input) => call("select", input),
    }),

    editor_move: createTool({
      id: "editor_move",
      description:
        "Move / yaw / lean a stamp. Pitch and roll are radians, -pi/2..pi/2. Set snap=false for precise fractional positioning. Same sit rules as place.",
      inputSchema: z.object({
        snap: z.boolean().optional(),
        id: z.string(),
        x: cellX,
        y: cellY,
        yaw: z.number().optional(),
        pitch: z
          .number()
          .min(-Math.PI / 2)
          .max(Math.PI / 2)
          .optional(),
        roll: z
          .number()
          .min(-Math.PI / 2)
          .max(Math.PI / 2)
          .optional(),
        widthScale: z
          .number()
          .min(0.25)
          .max(4)
          .optional()
          .describe("Local X multiplier before yaw; defaults to 1."),
        depthScale: z
          .number()
          .min(0.25)
          .max(4)
          .optional()
          .describe("Local Z multiplier before yaw; defaults to 1."),
        heightScale: z
          .number()
          .min(0.25)
          .max(4)
          .optional()
          .describe(
            "Local Y multiplier independent of uniform scale; defaults to 1.",
          ),
      }),
      execute: async (input) => call("move", input),
    }),

    editor_delete: createTool({
      id: "editor_delete",
      description:
        "Delete a stamp by id. Omitting id deletes the current selection.",
      inputSchema: z.object({ id: z.string().optional() }),
      execute: async (input) => call("delete", input),
    }),

    editor_look_at: createTool({
      id: "editor_look_at",
      description: "Pan the editor camera to a world cell.",
      inputSchema: z.object({ x: cellX, z: cellY }),
      execute: async (input) => call("lookAt", input),
    }),

    editor_set_tool: createTool({
      id: "editor_set_tool",
      description: "Arm select, stamp, brush, clean, or sculpt.",
      inputSchema: z.object({
        tool: z.enum([
          "select",
          "stamp",
          "brush",
          "clean",
          "sculpt",
          "terrain",
          "decal",
          "spawn",
        ]),
      }),
      execute: async (input) => call("setTool", input),
    }),

    editor_set_asset: createTool({
      id: "editor_set_asset",
      description: "Arm the stamp tool with a catalogue id.",
      inputSchema: z.object({ id: assetId }),
      execute: async (input) => call("setAsset", input),
    }),

    editor_brush: createTool({
      id: "editor_brush",
      description:
        "Foliage brush. kit = set slots; config = radius/density; paint = dab mask at x,z; apply = scatter stamps; clear = wipe mask.",
      inputSchema: z.object({
        action: z
          .enum(["kit", "config", "paint", "apply", "clear", "status"])
          .optional(),
        assets: z
          .array(assetId)
          .optional()
          .describe("Replace kit with these ids"),
        add: assetId.optional(),
        radius: z.number().optional(),
        density: z.number().optional(),
        x: z.number().optional(),
        z: z.number().optional(),
        erase: z.boolean().optional(),
      }),
      execute: async (input) => call("brush", input),
    }),

    editor_clean: createTool({
      id: "editor_clean",
      description:
        "Clean a disc at x,z: objects wipes stamps; foliage removes plants and grass/flower cover, preserving rocks and structures.",
      inputSchema: z.object({
        x: z.number(),
        z: z.number(),
        radius: z.number().optional(),
        type: z.enum(["objects", "foliage"]).optional(),
      }),
      execute: async (input) => call("clean", input),
    }),

    editor_sculpt: createTool({
      id: "editor_sculpt",
      description:
        "Height. action=stroke (raise; lower=true sinks) or apply (cut painted water basin). mode=live|water.",
      inputSchema: z.object({
        action: z.enum(["stroke", "apply"]).optional(),
        mode: z.enum(["live", "water"]).optional(),
        x: z.number().optional(),
        z: z.number().optional(),
        radius: z.number().optional(),
        strength: z.number().optional(),
        lower: z.boolean().optional(),
      }),
      execute: async (input) => call("sculpt", input),
    }),

    editor_rename: createTool({
      id: "editor_rename",
      description: "Set the map document name.",
      inputSchema: z.object({ name: z.string() }),
      execute: async (input) => call("rename", input),
    }),

    editor_screenshot: createTool({
      id: "editor_screenshot",
      description:
        "Screenshot the live editor canvas. Omit args for the current view. Optional x/z, zoom (ortho 6–180), yaw/pitch in degrees, iso, or gameCam. Pose is restored after the shot unless keep=true. Returns an image.",
      inputSchema: z.object({
        x: cellX.optional().describe("Look-at cell X. Omit for current view."),
        z: cellY
          .optional()
          .describe("Look-at cell Z. y is accepted as an alias."),
        y: cellY.optional(),
        zoom: z
          .number()
          .optional()
          .describe("Ortho half-height in cells (6–180). Ignored in Gamecam."),
        yaw: z
          .number()
          .optional()
          .describe("Orbit yaw in degrees. 45 is true-iso."),
        angle: z.number().optional().describe("Alias for yaw (degrees)."),
        pitch: z
          .number()
          .optional()
          .describe("Degrees down from the horizon. Iso ≈ 35, Gamecam 45."),
        iso: z
          .boolean()
          .optional()
          .describe("Reset yaw/pitch to true-iso before other overrides."),
        gameZoom: z
          .number()
          .min(0.5)
          .max(2)
          .optional()
          .describe(
            "Perspective distance relative to normal Play camera. 2 is maximum zoom out; .5 is closest.",
          ),
        gameCam: z
          .boolean()
          .optional()
          .describe("WC3 perspective for the shot."),
        game: z.boolean().optional(),
        keep: z
          .boolean()
          .optional()
          .describe("Leave the camera at the shot pose."),
        maxWidth: z
          .number()
          .optional()
          .describe("Output pixel width cap, 256–2048. Default 1280."),
        width: z.number().optional(),
        format: z
          .enum(["jpeg", "jpg", "png"])
          .optional()
          .describe("Default jpeg."),
        aspect: z
          .number()
          .min(0.5)
          .max(3)
          .optional()
          .describe(
            "Output aspect ratio for reproducible reference framing, e.g. 1.77778. Does not resize the user viewport.",
          ),
        quality: z.number().optional().describe("JPEG 0.4–0.95. Default 0.85."),
        animationTime: z
          .number()
          .min(0)
          .max(86400)
          .optional()
          .describe(
            "Fixed water and grass animation time in seconds for reproducible comparisons. Does not change the scene hour or pause live animation.",
          ),
      }),
      outputSchema: z.object({}).passthrough(),
      execute: async (input) => {
        const shot = await hub.call("screenshot", input, 20000);
        const o =
          shot && typeof shot === "object"
            ? (shot as Record<string, unknown>)
            : {};
        const data = typeof o.data === "string" ? o.data : "";
        const mime = typeof o.mime === "string" ? o.mime : "image/jpeg";
        const width = typeof o.width === "number" ? o.width : 0;
        const height = typeof o.height === "number" ? o.height : 0;
        const view =
          o.view && typeof o.view === "object"
            ? (o.view as Record<string, unknown>)
            : {};
        const framed = {
          width,
          height,
          mime,
          mapName: typeof o.mapName === "string" ? o.mapName : undefined,
          environment:
            o.environment && typeof o.environment === "object"
              ? o.environment
              : undefined,
          ...(typeof o.animationTime === "number"
            ? { animationTime: o.animationTime }
            : {}),
          view: {
            x: Number(view.x) || 0,
            z: Number(view.z) || 0,
            zoom: Number(view.zoom) || 0,
            yaw: Number(view.yaw) || 0,
            pitch: Number(view.pitch) || 0,
            gameCam: view.gameCam === true,
            gameZoom: Number(view.gameZoom) || 1,
          },
        };
        if (!data) throw new Error("screenshot returned no pixels");
        writeShot(data, mime, framed);
        return {
          ...framed,
          content: [
            {
              type: "text" as const,
              text: `${width}×${height} at (${framed.view.x.toFixed(1)}, ${framed.view.z.toFixed(1)}) zoom ${framed.view.zoom.toFixed(0)} yaw ${framed.view.yaw}° pitch ${framed.view.pitch}°${framed.view.gameCam ? " gamecam" : ""}`,
            },
            { type: "image" as const, data, mimeType: mime },
          ],
        };
      },
    }),
  };
}
