import {assetTools} from './assetTools';
/**
 * Mastra MCPServer for the world editor. Tools talk to the open editor tab.
 */
import { MCPServer } from "@mastra/mcp";
import type { EditorHub } from "./hub";
import { editorTools } from "./tools";

export function createEditorMcp(hub: EditorHub): MCPServer {
  const tools = {...editorTools(hub),...assetTools()};
  return new MCPServer({
    id: "utc-editor",
    name: "Under the Canopy Editor",
    version: "1.0.0",
    description: "Author live biome maps: procedural layers, scenery, gameplay placements, player starts and render captures.",
    instructions: [
      "Open a dedicated world editor tab (?screen=editor) and enable its MCP toggle. Verify editor_status before mutations; the hub targets the most recently connected tab.",
      "Discover the loaded biome's recipes with editor_scene command action=recipes, and current assets with editor_catalog or asset_author. Never assume asset IDs from an older project version.",
      "Author procedural masks and splines with editor_scene command action=put-layer; group several put-layer/put-object/remove edits into action=batch so the world regenerates once. Masks have add/subtract circular strokes; forests and foliage remain live. Stages run terrain, water, paths, structures, forest, grass automatically.",
      "Place independent scenery with put-object using canonical asset IDs, x/z, yaw in radians. Gameplay placements use editor_entities, position x/y (y is map Z), and rotation in degrees.",
      "Biomes own lighting, grading, canopy, atmosphere and water profiles. Maps choose biome, time and weather kind; visual overrides are forbidden.",
      "Read map dimensions and player slots from the exported map. Preserve base construction space and validate routes; do not assume a 256-square two-player map.",
      "Use editor_screenshot for actual visual review, with overview and game-distance views. Screenshots restore the camera unless keep=true.",
      "Use editor_landscape export to preserve the active map before loading another. Publish the editor-exported map to assets/maps/skirmish; browser saves are separate local copies.",
    ].join(" "),
    tools,
    resources: {
      listResources: async () => [
        { uri: "utc://editor/status", name: "Editor status", mimeType: "application/json" },
        { uri: "utc://editor/catalog", name: "Catalogue", mimeType: "application/json" },
        { uri: "utc://editor/stamps", name: "Placed stamps", mimeType: "application/json" },
      ],
      getResourceContent: async ({ uri }) => {
        if (uri === "utc://editor/status") return { text: JSON.stringify(await hub.call("status"), null, 2) };
        if (uri === "utc://editor/catalog") return { text: JSON.stringify(await hub.call("catalog", { limit: 200 }), null, 2) };
        if (uri === "utc://editor/stamps") return { text: JSON.stringify(await hub.call("stamps", { limit: 400 }), null, 2) };
        throw new Error(`unknown resource ${uri}`);
      },
    },
    prompts: {
      listPrompts: async () => [
        {
          name: "grove",
          description: "Scatter a pine grove around a point with the foliage brush.",
          arguments: [
            { name: "x", description: "Cell X", required: true },
            { name: "z", description: "Cell Z", required: true },
          ],
        },
        {
          name: "pond-edge",
          description: "Stamp lilies on wet cells near a point.",
          arguments: [
            { name: "x", description: "Cell X", required: true },
            { name: "z", description: "Cell Z", required: true },
          ],
        },
      ],
      getPromptMessages: async ({ name, args }) => {
        const x = args?.x ?? "128";
        const z = args?.z ?? "128";
        if (name === "grove") {
          return [
            {
              role: "user",
              content: {
                type: "text",
                text: `Discover the biome forest recipes with editor_scene, add a named live forest mask around (${x}, ${z}) with radius 8, then capture and inspect it.`,
              },
            },
          ];
        }
        if (name === "pond-edge") {
          return [
            {
              role: "user",
              content: {
                type: "text",
                text: `Discover the biome river recipe and its bank/water detail passes. Author or refine a painted pond at (${x}, ${z}), then capture its shoreline.`,
              },
            },
          ];
        }
        throw new Error(`unknown prompt ${name}`);
      },
    },
  });
}
