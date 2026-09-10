/** Real HTTP/WS MatchHost smoke test; no browser or renderer is required. */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { once } from "node:events";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { World } from "../src/sim/world/world";
import {
  parseUtcMap,
  type MatchConfig,
  type ServerMsg,
  type Action,
} from "../src/shared";
import { mapRevision } from "../src/shared/map/playable";
import { slotOwner } from "../src/content/schema";
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
  const created = await post("/api/rooms", {
      name: "Settlement verification",
      mapId: "mosswater-divide",
      mapRevision: mapRevision(map),
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
  for (let through = 100; through <= 3000; through += 100) {
    for (const i of [
      through % 200 === 0 ? 1 : 0,
      through % 200 === 0 ? 0 : 1,
    ]) {
      const sim = worlds[i]!.settlement!,
        owner = slotOwner(i);
      const actions: Action[] = [];
      if (through === 100) {
        const actor = sim.entities.find(
          (e) => e.owner === owner && e.definition === "unit.ants.settler",
        )!.id;
        const home = sim.entities.find(
          (e) => e.id === sim.state.objectives[owner],
        )!;
        let position: { x: number; y: number } | undefined;
        for (let y = home.y - 15; y <= home.y + 15 && !position; y++)
          for (let x = home.x - 15; x <= home.x + 15; x++)
            if (
              !sim.canBuild(owner, "building.ants.barracks", { x, y }, actor)
            ) {
              position = { x, y };
              break;
            }
        assert.ok(position, "Opening has a legal barracks site");
        actions.push({
          type: "build",
          actor,
          definition: "building.ants.barracks",
          position,
        });
      } else if (through === 1800) {
        const barracks = sim.entities.find(
          (e) => e.owner === owner && e.definition === "building.ants.barracks",
        );
        assert.ok(
          barracks && !barracks.construction,
          "Worker construction completed",
        );
        actions.push({
          type: "produce",
          actor: barracks.id,
          definition: "unit.ants.warrior",
        });
        actions.push({
          type: "produce",
          actor: barracks.id,
          definition: "unit.ants.archer",
        });
      }
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
  await until(() => hashOK.every((n) => n === 15));
  for (const world of worlds)
    for (const owner of [0, 1]) {
      const s = world.settlement!;
      const owned = s.entities.filter((e) => e.owner === slotOwner(owner));
      assert.equal(
        owned.filter((e) => e.definition === "unit.ants.settler").length,
        8,
      );
      assert.equal(
        owned.filter((e) => e.definition === "unit.ants.warrior").length,
        3,
      );
      assert.equal(
        owned.filter((e) => e.definition === "unit.ants.archer").length,
        1,
      );
      assert.equal(owned.filter((e) => e.unit).length, 13);
      assert.equal(s.state.accounting.consumed["item.wood"], 160);
      assert.equal(s.state.accounting.consumed["item.amber"], 800);
    }
  console.log(
    JSON.stringify(
      {
        result: "passed",
        ticks: 3000,
        clients: 2,
        hostConfirmedHashes: hashOK,
        checksum: worlds[0]!.checksum(),
        consumed: worlds[0]!.settlement!.state.accounting.consumed,
      },
      null,
      2,
    ),
  );
} finally {
  sockets.forEach((ws) => ws.close());
  server.kill("SIGTERM");
}
