/**
 * Stdio Mastra MCP + localhost hub the editor tab joins.
 * Cursor launches this; do not console.log (stdio).
 */
import { EDITOR_MCP_PORT } from "../../src/shared/control/rpc";
import { EditorHub } from "./hub";
import { createEditorMcp } from "./server";

const port = Number(process.env.EDITOR_MCP_PORT) || EDITOR_MCP_PORT;
const hub = new EditorHub();
const mode = await hub.listen(port);
console.error(`editor mcp stdio (${mode})`);
const server = createEditorMcp(hub);
await server.startStdio();
