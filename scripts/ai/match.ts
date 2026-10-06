/** Reproducible headless match: node --import tsx scripts/ai/match.ts [map] [ticks] [duel|passive] */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parseUtcMap } from "../../src/shared/map/utcmap";
import { World } from "../../src/sim/world/world";
const path = process.argv[2] ?? "assets/maps/skirmish/amberwake-basin.utcmap";
const map = parseUtcMap(JSON.parse(readFileSync(path, "utf8")))!;
if (!map) throw new Error("Invalid map");
const ticks = Number(process.argv[3] ?? 12000),
  duel = process.argv[4] !== "passive";
const world = new World({
  map,
  seed: 42,
  slots: map.playerStarts.map((p, i) => ({
    player: p.player - 1,
    kind: i === 0 || duel ? "ai" : "human",
  })),
});
if (process.argv[7]) world.restore(JSON.parse(readFileSync(process.argv[7], "utf8")));
const initialTick = world.clock.tickIndex;
// Count newly created actors, not the old worker-to-soldier conversion. This
// includes summoned actors; queued recruitment is reported separately by AI metrics.
const spawnedUnits: Record<string, number> = {}, shots: Record<string, number> = {};
const known = new Set(world.settlement.entities.map(e=>e.id));
let lastShell = Math.max(0, ...world.settlement.state.shells.map(s=>s.id));
const tickSamples: number[] = [];
const samples: number[] = [],
  started = performance.now();
for (let i = 0; i < ticks && !world.settlement.state.outcome; i++) {
  const tickStarted = performance.now();
  world.tick();
  tickSamples.push(performance.now() - tickStarted);
  samples.push(...Object.values(world.aiTimings));
  for (const e of world.settlement.entities) {
    if (!known.has(e.id) && e.unit && e.owner !== 'none') {
      const key = `${e.owner}:${e.definition}`;
      spawnedUnits[key] = (spawnedUnits[key] ?? 0) + 1;
    }
    known.add(e.id);
  }
  for (const shell of world.settlement.state.shells) {
    if (shell.id <= lastShell) continue;
    const key = `${shell.owner}:${shell.definition}`;
    shots[key] = (shots[key] ?? 0) + 1;
    lastShell = Math.max(lastShell,shell.id);
  }
  if (i % 2000 === 1999)
    console.log(
      JSON.stringify({
        tick: world.clock.tickIndex,
        spawnedUnits, shots,
        wallets: world.settlement.state.wallets,
        ai: world.aiSummary().map(({ trace, ...s }) => s),
      }),
    );
}
samples.sort((a, b) => a - b);
tickSamples.sort((a, b) => a - b);
const summary = {
  map: path,
  tick: world.clock.tickIndex,
  initialTick, spawnedUnits, shots,
  wallets: world.settlement.state.wallets,
  wallMs: performance.now() - started,
  simulationMs: {
    p50: tickSamples[Math.floor(tickSamples.length * .5)],
    p95: tickSamples[Math.floor(tickSamples.length * .95)],
    p99: tickSamples[Math.floor(tickSamples.length * .99)],
    max: tickSamples.at(-1),
  },
  aiMs: {
    p50: samples[Math.floor(samples.length * 0.5)],
    p95: samples[Math.floor(samples.length * 0.95)],
    p99: samples[Math.floor(samples.length * 0.99)],
    max: samples.at(-1),
  },
  outcome: world.settlement.state.outcome,
  research: world.settlement.state.research,
  jobs: world.settlement.state.jobs,
  buildings: world.settlement.entities.filter(e=>e.owner!=="none" && world.settlement.registry.get(e.definition).kind==="building").map(e=>({id:e.id,owner:e.owner,definition:e.definition,x:e.x,y:e.y,rotation:e.rotation,construction:e.construction,upgrade:e.upgrade,research:e.research})),
  ai: world.aiSummary(),
  banks: world.settlement.entities
    .filter(
      (e) =>
        world.settlement.registry.get(e.definition).behaviors.storage?.dropoff,
    )
    .map((e) => ({ owner: e.owner, inventory: e.inventory })),
  units: world.settlement.entities
    .filter((e) => e.owner !== "none" && e.unit)
    .map((e) => ({
      id: e.id,
      owner: e.owner,
      definition: e.definition,
      hp: e.hp,
      x: e.x,
      y: e.y,
      order: e.unit?.order,
      job: e.unit?.job,
      cargo: e.unit?.cargo,
    })),
};
mkdirSync("tmp/ai", { recursive: true });
writeFileSync(
  process.argv[5] ?? "tmp/ai/latest-match.json",
  JSON.stringify(summary, null, 2),
);
if (process.argv[6]) writeFileSync(process.argv[6], JSON.stringify(world.snapshot()));
console.log(JSON.stringify({ ...summary, units: undefined, jobs: undefined }, null, 2));
