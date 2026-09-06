/**
 * Wire between the Mastra MCP process and the in-tab world editor.
 * One JSON frame per request/response. New ops are additive.
 */
export const EDITOR_MCP_PORT = 7380;
export const EDITOR_MCP_HOST = "127.0.0.1";

export type RpcReq = {
  readonly id: number;
  readonly op: string;
  readonly params?: unknown;
};

export type RpcRes =
  | { readonly id: number; readonly ok: true; readonly result: unknown }
  | { readonly id: number; readonly ok: false; readonly error: string };

export function parseRpcReq(raw: unknown): RpcReq | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "number" || !Number.isFinite(o.id)) return null;
  if (typeof o.op !== "string" || !o.op.trim()) return null;
  return { id: o.id, op: o.op.trim(), params: o.params };
}

export function parseRpcRes(raw: unknown): RpcRes | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "number" || !Number.isFinite(o.id)) return null;
  if (o.ok === true) return { id: o.id, ok: true, result: o.result };
  if (o.ok === false && typeof o.error === "string") return { id: o.id, ok: false, error: o.error };
  return null;
}

export function editorMcpUrl(port = EDITOR_MCP_PORT): string {
  return `ws://${EDITOR_MCP_HOST}:${port}`;
}
