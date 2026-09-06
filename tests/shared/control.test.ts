import { describe, expect, it } from "vitest";
import { EDITOR_MCP_PORT, filterCatalog, parseCatalogQuery, parseRpcReq, parseRpcRes } from "../../src/shared";
import { clampPort, parseMcpPrefs } from "../../src/editor/control/mcpPrefs";

describe("editor mcp wire", () => {
  it("parses rpc frames", () => {
    expect(parseRpcReq({ id: 1, op: "status" })).toEqual({ id: 1, op: "status", params: undefined });
    expect(parseRpcReq({ id: "1", op: "status" })).toBeNull();
    expect(parseRpcRes({ id: 1, ok: true, result: { n: 1 } })).toEqual({ id: 1, ok: true, result: { n: 1 } });
    expect(parseRpcRes({ id: 2, ok: false, error: "nope" })).toEqual({ id: 2, ok: false, error: "nope" });
  });

  it("filters catalogue", () => {
    const assets = [
      { id: "pine", name: "Pine", category: "foliage" as const, type: "prop" as const, file: "props/pine.gltf" },
      { id: "lily", name: "Lily", category: "water" as const, type: "water" as const, file: "props/lily.gltf" },
    ];
    expect(filterCatalog(assets, { type: "water" }).map((a) => a.id)).toEqual(["lily"]);
    expect(filterCatalog(assets, { q: "PI" }).map((a) => a.id)).toEqual(["pine"]);
    expect(parseCatalogQuery({ category: "nope", q: "x" })).toEqual({ q: "x" });
  });

  it("parses mcp prefs", () => {
    expect(parseMcpPrefs(null)).toEqual({ enabled: false, port: EDITOR_MCP_PORT });
    expect(parseMcpPrefs({ enabled: true, port: 9000 })).toEqual({ enabled: true, port: 9000 });
    expect(clampPort(0)).toBe(EDITOR_MCP_PORT);
    expect(clampPort(80.2)).toBe(80);
  });
});
