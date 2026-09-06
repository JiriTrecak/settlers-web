# control

MCP face of the world editor. `EditorControl` is the op registry. `EditorBridge` is the WebSocket client. `McpPrefsStore` is enabled/port in localStorage. The Mastra process (`mcp/editor`) is the other end.

Add an op: method on `EditorControl.ops` + `createTool` in `mcp/editor/tools.ts`. Don't add a second bus.
