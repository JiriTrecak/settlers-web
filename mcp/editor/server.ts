/**
 * Mastra MCPServer for the world editor. Tools talk to the open editor tab.
 */
import { MCPServer } from "@mastra/mcp";
import type { EditorHub } from "./hub";
import { editorTools } from "./tools";

export function createEditorMcp(hub: EditorHub): MCPServer {
  const tools = editorTools(hub);
  return new MCPServer({
    id: "utc-editor",
    name: "Under the Canopy Editor",
    version: "1.0.0",
    description: "Control the in-game world editor: catalogue, stamps, brush, clean, sculpt.",
    instructions: [
      "The world editor must be open (?screen=editor) and this process running so the tab can connect.",
      "Cell grid is 256²; halo allows stamps from -16 to 271. Cell = 1 meter.",
      "type=water sits on the sea, wet cells only. type=prop is dry land only. type=span (bridges) anywhere on the sea plane.",
      "Browse with editor_catalog before placing. Handmade ids: pine, boulder, rock, lily, bridge-8. Synty pack is synty-*.",
      "Brush: editor_brush kit with assets, paint at cells, then apply. Sculpt water: mode=water, stroke a basin, action=apply.",
      "Prefer editor_place items[] for batches. Check editor_status if a call fails.",
      "After placing or painting, editor_screenshot (no args = current view) so you can see the result. Pass x/z/zoom/yaw/pitch for a framed shot; the user camera is restored unless keep=true.",
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
                text: `Open the editor catalogue, pick pine variants, set a brush kit, paint around (${x}, ${z}) radius ~8, apply, then look at that point.`,
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
                text: `Browse water-type assets. Place lily / synty lilies on wet cells near (${x}, ${z}). Skip dry cells. Look at the pond.`,
              },
            },
          ];
        }
        throw new Error(`unknown prompt ${name}`);
      },
    },
  });
}
