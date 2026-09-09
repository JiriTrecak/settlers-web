/** Reproducible headless match: node --import tsx scripts/ai/match.ts [map] [ticks] [duel|passive] */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parseUtcMap } from "../../src/shared/map/utcmap";
import { World } from "../../src/sim/world/world";
const path = process.argv[2] ?? "assets/maps/showcase/mosswater-divide.utcmap";
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
const samples: number[] = [],
  started = performance.now();
for (let i = 0; i < ticks && !world.settlement.state.outcome; i++) {
  world.tick();
  samples.push(...Object.values(world.aiTimings));
  if (i % 2000 === 1999)
    console.log(
      JSON.stringify({
        tick: i + 1,
        ai: world.aiSummary().map(({ trace, ...s }) => s),
      }),
    );
}
samples.sort((a, b) => a - b);
const summary = {
  map: path,
  tick: world.clock.tickIndex,
  wallMs: performance.now() - started,
  aiMs: {
    p50: samples[Math.floor(samples.length * 0.5)],
    p95: samples[Math.floor(samples.length * 0.95)],
    p99: samples[Math.floor(samples.length * 0.99)],
    max: samples.at(-1),
  },
  outcome: world.settlement.state.outcome,
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
mkdirSync("experiments/ai", { recursive: true });
writeFileSync(
  process.argv[5] ?? "experiments/ai/latest-match.json",
  JSON.stringify(summary, null, 2),
);
console.log(JSON.stringify({ ...summary, units: undefined }, null, 2));
