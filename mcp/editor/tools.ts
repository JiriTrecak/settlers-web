/**
 * Mastra tools → EditorHub ops. Add a createTool here when you add an EditorControl op.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { EditorHub } from "./hub";

const SHOT = join(dirname(fileURLToPath(import.meta.url)), "../../tmp/editor-shot.jpg");

function writeShot(data: string, mime: string): void {
  const ext = mime.includes("png") ? "png" : "jpg";
  const path = ext === "png" ? SHOT.replace(/\.jpg$/, ".png") : SHOT;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.from(data, "base64"));
}

const assetId = z.string().describe("Catalogue id, e.g. pine or synty-tree-pine-01");
const cellX = z.number().describe("Cell X. Playable 0–255, halo −16–271");
const cellY = z.number().describe("Cell Y / Z. Same range as X");

export function editorTools(hub: EditorHub) {
  const call = (op: string, params?: unknown) => hub.call(op, params);

  return {
    editor_status: createTool({
      id: "editor_status",
      description: "Editor connection, map name, stamp count, current tool/asset, camera, brush kit.",
      inputSchema: z.object({}),
      execute: async () => call("status"),
    }),

    editor_catalog: createTool({
      id: "editor_catalog",
      description: "Browse catalogue assets. Filter by text, category, or sit type (prop/water/span).",
      inputSchema: z.object({
        q: z.string().optional().describe("Name or id substring"),
        category: z.enum(["foliage", "terrain", "water", "landmark", "resource", "other"]).optional(),
        type: z.enum(["prop", "water", "span"]).optional(),
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
        scale: z.number().optional(),
        items: z
          .array(
            z.object({
              asset: assetId,
              x: cellX,
              y: cellY,
              yaw: z.number().optional(),
              scale: z.number().optional(),
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
      description: "Move / yaw a stamp. Same sit rules as place.",
      inputSchema: z.object({
        id: z.string(),
        x: cellX,
        y: cellY,
        yaw: z.number().optional(),
      }),
      execute: async (input) => call("move", input),
    }),

    editor_delete: createTool({
      id: "editor_delete",
      description: "Delete a stamp by id. Omitting id deletes the current selection.",
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
        tool: z.enum(["select", "stamp", "brush", "clean", "sculpt"]),
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
        action: z.enum(["kit", "config", "paint", "apply", "clear", "status"]).optional(),
        assets: z.array(assetId).optional().describe("Replace kit with these ids"),
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
      description: "Wipe stamps in a disc at x,z (Objects).",
      inputSchema: z.object({
        x: z.number(),
        z: z.number(),
        radius: z.number().optional(),
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
        "Screenshot the live editor canvas. Omit args for the current view. Optional x/z, zoom (ortho 6–90), yaw/pitch in degrees, iso, or gameCam. Pose is restored after the shot unless keep=true. Returns an image.",
      inputSchema: z.object({
        x: cellX.optional().describe("Look-at cell X. Omit for current view."),
        z: cellY.optional().describe("Look-at cell Z. y is accepted as an alias."),
        y: cellY.optional(),
        zoom: z.number().optional().describe("Ortho half-height in cells (6–90). Ignored in Gamecam."),
        yaw: z.number().optional().describe("Orbit yaw in degrees. 45 is true-iso."),
        angle: z.number().optional().describe("Alias for yaw (degrees)."),
        pitch: z.number().optional().describe("Degrees down from the horizon. Iso ≈ 35, Gamecam 56."),
        iso: z.boolean().optional().describe("Reset yaw/pitch to true-iso before other overrides."),
        gameCam: z.boolean().optional().describe("WC3 perspective for the shot."),
        game: z.boolean().optional(),
        keep: z.boolean().optional().describe("Leave the camera at the shot pose."),
        maxWidth: z.number().optional().describe("Output pixel width cap, 256–2048. Default 1280."),
        width: z.number().optional(),
        format: z.enum(["jpeg", "jpg", "png"]).optional().describe("Default jpeg."),
        quality: z.number().optional().describe("JPEG 0.4–0.95. Default 0.85."),
      }),
      outputSchema: z.object({
        width: z.number(),
        height: z.number(),
        mime: z.string(),
        view: z.object({
          x: z.number(),
          z: z.number(),
          zoom: z.number(),
          yaw: z.number(),
          pitch: z.number(),
          gameCam: z.boolean(),
        }),
      }),
      execute: async (input) => {
        const shot = await hub.call("screenshot", input, 20000);
        const o = shot && typeof shot === "object" ? (shot as Record<string, unknown>) : {};
        const data = typeof o.data === "string" ? o.data : "";
        const mime = typeof o.mime === "string" ? o.mime : "image/jpeg";
        const width = typeof o.width === "number" ? o.width : 0;
        const height = typeof o.height === "number" ? o.height : 0;
        const view = o.view && typeof o.view === "object" ? (o.view as Record<string, unknown>) : {};
        const framed = {
          width,
          height,
          mime,
          view: {
            x: Number(view.x) || 0,
            z: Number(view.z) || 0,
            zoom: Number(view.zoom) || 0,
            yaw: Number(view.yaw) || 0,
            pitch: Number(view.pitch) || 0,
            gameCam: view.gameCam === true,
          },
        };
        if (!data) throw new Error("screenshot returned no pixels");
        writeShot(data, mime);
        return {
          ...framed,
          content: [
            {
              type: "text" as const,
              text: `${width}×${height} at (${framed.view.x.toFixed(1)}, ${framed.view.z.toFixed(1)}) zoom ${framed.view.zoom.toFixed(0)} yaw ${framed.view.yaw}° pitch ${framed.view.pitch}°${framed.view.gameCam ? " gamecam" : ""}`,
            },
            { type: "image" as const, data, mimeType: mime },
          ],
        } as unknown as typeof framed;
      },
    }),
  };
}
