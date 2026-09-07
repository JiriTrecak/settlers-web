/**
 * Browser client for the Mastra MCP hub. Reconnects while enabled.
 */
import { EDITOR_MCP_PORT, editorMcpUrl, parseRpcReq, type RpcRes } from "../../shared";
import type { EditorControl } from "./editorControl";
import type { McpLink } from "./mcpPrefs";

export class EditorBridge {
  private sock: WebSocket | null = null;
  private timer = 0;
  private dead = true;
  private port = EDITOR_MCP_PORT;
  link: McpLink = "off";

  constructor(
    private readonly control: EditorControl,
    private readonly onLink: (link: McpLink) => void = () => {},
  ) {}

  start(port = EDITOR_MCP_PORT): void {
    this.port = port;
    this.dead = false;
    this.sock?.close();
    this.sock = null;
    window.clearTimeout(this.timer);
    this.connect();
  }

  stop(): void {
    this.dead = true;
    window.clearTimeout(this.timer);
    this.sock?.close();
    this.sock = null;
    this.setLink("off");
  }

  private connect(): void {
    if (this.dead) return;
    this.setLink("connecting");
    const sock = new WebSocket(editorMcpUrl(this.port));
    this.sock = sock;
    sock.addEventListener("open", () => {
      if (this.sock !== sock) return;
      sock.send(JSON.stringify({ role: "tab" }));
      this.setLink("connected");
    });
    sock.addEventListener("message", (ev) => this.onMessage(sock, ev.data));
    sock.addEventListener("close", () => this.retry());
    sock.addEventListener("error", () => sock.close());
  }

  private retry(): void {
    this.sock = null;
    if (this.dead) return;
    this.setLink("connecting");
    this.timer = window.setTimeout(() => this.connect(), 1500);
  }

  private setLink(link: McpLink): void {
    if (this.link === link) return;
    this.link = link;
    this.onLink(link);
  }

  private async onMessage(sock: WebSocket, data: unknown): Promise<void> {
    if (typeof data !== "string") return;
    let raw: unknown;
    try {
      raw = JSON.parse(data);
    } catch {
      return;
    }
    const req = parseRpcReq(raw);
    if (!req) return;
    let res: RpcRes;
    try {
      res = { id: req.id, ok: true, result: await this.control.dispatch(req.op, req.params) };
    } catch (err) {
      res = { id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    if (sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify(res));
  }
}
