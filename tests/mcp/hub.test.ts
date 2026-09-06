import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { EditorHub } from "../../mcp/editor/hub";

const PORT = 17380;

describe("editor hub join", () => {
  const hubs: EditorHub[] = [];

  afterEach(() => {
    for (const h of hubs) h.stop();
    hubs.length = 0;
  });

  it("second listen joins and the host proxies to the tab", async () => {
    const host = track(new EditorHub());
    expect(await host.listen(PORT)).toBe("host");

    const tab = new WebSocket(`ws://127.0.0.1:${PORT}`);
    await opened(tab);
    tab.send(JSON.stringify({ role: "tab" }));
    tab.on("message", (data) => {
      const req = JSON.parse(String(data)) as { id: number; op: string };
      tab.send(JSON.stringify({ id: req.id, ok: true, result: { op: req.op } }));
    });
    await delay(40);

    const client = track(new EditorHub());
    expect(await client.listen(PORT)).toBe("join");
    expect(await client.call("status")).toEqual({ op: "status" });
    tab.close();
  });

  function track(hub: EditorHub): EditorHub {
    hubs.push(hub);
    return hub;
  }
});

function opened(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
