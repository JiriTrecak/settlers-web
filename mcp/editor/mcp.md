# editor MCP

Mastra `MCPServer` over stdio. The game tab connects to `ws://127.0.0.1:7380`.

```
Cursor  --stdio-->  mcp/editor  --WS-->  EditorScreen / EditorControl

First process binds `127.0.0.1:7380`. A second (Cursor, if you also ran `npm run mcp:editor`) joins that hub instead of dying on EADDRINUSE.
```

Add a capability: `EditorControl.ops` + `createTool` in `tools.ts`. Same `op` string.

`editor_screenshot` grabs the live canvas (optional loc / zoom / yaw° / pitch°). Pose restores unless `keep`. Returns an MCP image.

Run: `npm run mcp:editor` (Cursor does this via `.cursor/mcp.json`). Editor: `?screen=editor`.
