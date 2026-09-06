/**
 * Persisted MCP client prefs. Enabled + port survive reloads; the bridge
 * reconnects on editor start when enabled is on.
 */
import { EDITOR_MCP_PORT } from "../../shared";

export const MCP_PREFS_KEY = "utc.mcp";

export type McpPrefs = {
  readonly enabled: boolean;
  readonly port: number;
};

export type McpLink = "off" | "connecting" | "connected";

export function defaultMcpPrefs(): McpPrefs {
  return { enabled: false, port: EDITOR_MCP_PORT };
}

export function parseMcpPrefs(raw: unknown): McpPrefs {
  const fallback = defaultMcpPrefs();
  if (!raw || typeof raw !== "object") return fallback;
  const o = raw as Record<string, unknown>;
  return {
    enabled: o.enabled === true,
    port: clampPort(typeof o.port === "number" ? o.port : fallback.port),
  };
}

export function clampPort(n: number): number {
  if (!Number.isFinite(n) || n < 1 || n > 65535) return EDITOR_MCP_PORT;
  return Math.round(n);
}

export class McpPrefsStore {
  value: McpPrefs;

  constructor(private readonly store: Pick<Storage, "getItem" | "setItem"> | null = defaultStore()) {
    this.value = parseMcpPrefs(this.read());
  }

  setEnabled(on: boolean): void {
    this.value = { ...this.value, enabled: on };
    this.write();
  }

  setPort(port: number): void {
    this.value = { ...this.value, port: clampPort(port) };
    this.write();
  }

  private read(): unknown {
    if (!this.store) return null;
    try {
      const raw = this.store.getItem(MCP_PREFS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  private write(): void {
    this.store?.setItem(MCP_PREFS_KEY, JSON.stringify(this.value));
  }
}

function defaultStore(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
