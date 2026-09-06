# control

JSON-RPC-ish frames the Mastra MCP process sends to the editor tab over localhost WebSocket. Ops are string names; add a handler on `EditorControl` and a `createTool` — don't invent a second bus.
