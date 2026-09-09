import { expect, it } from "vitest";
import { game, worker } from "./helpers";
import { idleMotion } from "../../src/sim/game/idleMotion";
import { precise } from "../../src/sim/game/motion";

it("strolls at half speed near its resting point and immediately yields to an order", () => {
  const g = game(), w = worker(g);
  w.x = 100; w.y = 100;
  for (let i = 0; i < 800; i++) {
    g.state.tick++;
    idleMotion(g.context);
    if (w.unit!.idle?.walking) break;
  }
  expect(w.unit!.idle?.walking).toBe(true);
  const before = precise(w);
  g.context.move();
  const after = precise(w);
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeCloseTo(2 / 40, 2);
  expect(Math.abs(after.x - 100)).toBeLessThanOrEqual(1);
  const result = g.command("player.1", {type: "move", actors: [w.id], destination: {x: 110, y: 100}});
  expect(result.accepted).toBe(true);
  expect(w.unit!.idle).toBeNull();
});

it("produces identical strolls after snapshot restore and never drifts beyond its home neighborhood", () => {
  const a = game(), w = worker(a); w.x = 100; w.y = 100;
  a.observation.update();
  const soldiers = a.entities.filter(e => e.definition === "unit.ants.warrior").map(e => [e.id, e.x, e.y]);
  const b = game(); b.restore(a.snapshot());
  for (let i = 0; i < 1600; i++) {
    for (const g of [a, b]) {
      g.state.tick++;
      idleMotion(g.context);
      g.context.move();
    }
    const p = precise(w);
    expect(Math.abs(p.x - 100)).toBeLessThanOrEqual(1);
    expect(Math.abs(p.y - 100)).toBeLessThanOrEqual(1);
  }
  expect(a.state).toEqual(b.state);
  expect(a.entities.filter(e => e.definition === "unit.ants.warrior").map(e => [e.id, e.x, e.y])).toEqual(soldiers);
});
