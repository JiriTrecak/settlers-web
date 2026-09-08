/** Real HTTP/WS MatchHost smoke test; no browser or renderer is required. */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { once } from "node:events";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { World } from "../src/sim/world/world";
import { parseUtcMap, type MatchConfig, type ServerMsg } from "../src/shared";
import { RULES_REVISION } from "../src/shared/settlement/rules";
const port = 18787,
  base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
  env: { ...process.env, PORT: String(port), BIND: "127.0.0.1" },
  stdio: ["ignore", "pipe", "pipe"],
});
const sockets: WebSocket[] = [];
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failure: Error | undefined;
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 15000;
  while (!predicate()) {
    if (failure) throw failure;
    if (Date.now() > deadline) throw Error("Network verification timed out");
    await pause(5);
  }
}
async function post(path: string, body: unknown = {}, token?: string) {
  const r = await fetch(base + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  assert.equal(r.status, 200);
  return r.json();
}
try {
  await Promise.race([
    once(server.stdout!, "data"),
    once(server, "exit").then(() => {
      throw Error("MatchHost exited before listening");
    }),
  ]);
  const raw = readFileSync(
      new URL(
        "../assets/maps/showcase/mosswater-divide.utcmap",
        import.meta.url,
      ),
      "utf8",
    ),
    map = parseUtcMap(JSON.parse(raw))!;
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++)
    hash = Math.imul(hash ^ raw.charCodeAt(i), 16777619);
  const created = await post("/api/rooms", {
      name: "Settlement verification",
      mapId: "mosswater-divide",
      mapRevision: `${RULES_REVISION}-${(hash >>> 0).toString(16)}`,
      slotCount: 2,
      guestName: "Blue",
    }),
    id = created.room.id;
  const joined = await post(`/api/rooms/${id}/join`, {
      guestName: "Red",
      role: "player",
    }),
    tokens = [created.token, joined.token];
  const worlds: World[] = [],
    hashOK = [0, 0];
  for (let i = 0; i < 2; i++) {
    const ws = new WebSocket(
      `ws://127.0.0.1:${port}/match/${id}?token=${tokens[i]}`,
    );
    sockets.push(ws);
    ws.on("error", (e) => {
      failure = e;
    });
    ws.on("message", (data) => {
      try {
        const m = JSON.parse(String(data)) as ServerMsg;
        if (m.type === "start")
          worlds[i] = new World({
            map,
            slots: m.config.slots,
            seed: m.config.seed,
          });
        if (m.type === "commit") {
          const world = worlds[i]!;
          assert.equal(m.tick, world.clock.tickIndex + 1);
          for (const slot of m.slots)
            slot.actions.forEach((a, seq) =>
              world.enqueue(a, m.tick, { player: slot.player, seq }),
            );
          world.tick();
          if (m.tick % 200 === 0)
            ws.send(
              JSON.stringify({
                type: "hash",
                tick: m.tick,
                checksum: world.checksum(),
              }),
            );
        }
        if (m.type === "hashOk") hashOK[i]++;
        if (m.type === "desync" || m.type === "error")
          failure = Error(JSON.stringify(m));
      } catch (e) {
        failure = e as Error;
      }
    });
    await once(ws, "open");
  }
  const started = await post(`/api/rooms/${id}/start`, {}, tokens[0]);
  assert.equal((started.config as MatchConfig).slots.length, 2);
  await until(() => worlds.length === 2);
  sockets.forEach((ws) => ws.send(JSON.stringify({ type: "ready" })));
  for (let through = 100; through <= 6000; through += 100) {
    for (const i of [
      through % 200 === 0 ? 1 : 0,
      through % 200 === 0 ? 0 : 1,
    ]) {
      const home = i === 0 ? 210 : 46,
        sign = i === 0 ? 1 : -1;
      const actions =
        through === 100
          ? [
              {
                type: "build",
                kind: "lumberjack",
                x: home - sign * 10,
                z: home,
              },
              {
                type: "build",
                kind: "stonemason",
                x: home,
                z: home + sign * 12,
              },
              {
                type: "build",
                kind: "sawmill",
                x: home + sign * 10,
                z: home + sign * 10,
              },
            ]
          : through === 2100
            ? [{ type: "build", kind: "house", x: home + sign * 12, z: home }]
            : [];
      sockets[i]!.send(
        JSON.stringify({
          type: "turn",
          through,
          bundles: actions.length ? [{ tick: through - 99, actions }] : [],
        }),
      );
    }
    await until(() => worlds.every((w) => w.clock.tickIndex >= through));
    assert.equal(worlds[0]!.checksum(), worlds[1]!.checksum());
  }
  await until(() => hashOK.every((n) => n === 30));
  for (const world of worlds)
    for (const owner of [0, 1]) {
      const s = world.settlement!;
      assert.equal(s.workers.filter((w) => w.owner === owner).length, 11);
      assert.equal(
        s.buildings.filter((b) => b.owner === owner && b.complete).length,
        5,
      );
      assert.ok(s.colonies[owner]!.stock.wood > 20);
      assert.ok(s.colonies[owner]!.stock.stone > 22);
    }
  console.log(
    JSON.stringify(
      {
        result: "passed",
        ticks: 6000,
        clients: 2,
        hostConfirmedHashes: hashOK,
        checksum: worlds[0]!.checksum(),
        colonies: worlds[0]!.settlement!.colonies,
      },
      null,
      2,
    ),
  );
} finally {
  sockets.forEach((ws) => ws.close());
  server.kill("SIGTERM");
}
