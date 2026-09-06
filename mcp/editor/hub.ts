/**
 * Localhost WebSocket the editor tab joins. MCP tools call through here.
 * Stdio MCP must not write to stdout — use stderr.
 */
import { WebSocketServer, type WebSocket } from "ws";
import { EDITOR_MCP_HOST, EDITOR_MCP_PORT, parseRpcRes } from "../../src/shared/control/rpc";

export class EditorHub {
  private sock: WebSocket | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  get connected(): boolean {
    return this.sock?.readyState === 1;
  }

  listen(port = EDITOR_MCP_PORT): WebSocketServer {
    const wss = new WebSocketServer({ host: EDITOR_MCP_HOST, port });
    wss.on("connection", (ws) => {
      this.attach(ws);
      console.error(`editor hub: tab connected (${wss.clients.size})`);
    });
    wss.on("listening", () => console.error(`editor hub ws://${EDITOR_MCP_HOST}:${port}`));
    return wss;
  }

  async call(op: string, params?: unknown, timeoutMs = 8000): Promise<unknown> {
    const ws = this.sock;
    if (!ws || ws.readyState !== 1) {
      throw new Error("Editor not connected. Open the world editor (?screen=editor) while this MCP server is running.");
    }
    const id = this.nextId++;
    const result = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`editor op '${op}' timed out`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
    });
    ws.send(JSON.stringify({ id, op, params }));
    return result;
  }

  private attach(ws: WebSocket): void {
    this.sock?.close();
    this.sock = ws;
    ws.on("message", (data) => this.onMessage(String(data)));
    ws.on("close", () => {
      if (this.sock === ws) this.sock = null;
      for (const [id, wait] of this.pending) {
        this.pending.delete(id);
        wait.reject(new Error("editor disconnected"));
      }
    });
  }

  private onMessage(text: string): void {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return;
    }
    const res = parseRpcRes(raw);
    if (!res) return;
    const wait = this.pending.get(res.id);
    if (!wait) return;
    this.pending.delete(res.id);
    if (res.ok) wait.resolve(res.result);
    else wait.reject(new Error(res.error));
  }
}
