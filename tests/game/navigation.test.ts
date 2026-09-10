import { describe, expect, it } from "vitest";
import { Navigation, canTraverse } from "../../src/sim/game/navigation";
import { cell } from "../../src/sim/game/spatial";
import { game as baseGame, worker } from "./helpers";

describe("eight-direction navigation", () => {
  it("takes direct diagonals and safely reuses buffers across goals and blockers", () => {
    const nav = new Navigation(8, () => true);
    expect(nav.path(0, 63)).toEqual([9, 18, 27, 36, 45, 54, 63]);
    const detour = nav.path(0, 63, new Set([9]))!;
    expect(detour).not.toContain(9);
    expect(nav.path(63, 0)).toEqual([54, 45, 36, 27, 18, 9, 0]);
    expect(nav.path(0, 63)).toEqual([9, 18, 27, 36, 45, 54, 63]);
    expect(nav.path(0, 63, new Set([1, 8]))).toBeNull();
  });
  it("does not cross corners, steep side corridors or row boundaries", () => {
    expect(canTraverse(4, 0, 5, (_a, b) => b !== 1)).toBe(false);
    expect(canTraverse(4, 0, 5, (a, b) => !(a === 4 && b === 5))).toBe(false);
    expect(canTraverse(4, 3, 4, () => true)).toBe(false);
    expect(canTraverse(4, 0, 5, () => true)).toBe(true);
  });
  it("matches an independent shortest-cost search on obstacle layouts", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const blocked = new Set<number>();
      let rng = seed;
      for (let i = 1; i < 63; i++) {
        rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
        if (rng % 5 === 0) blocked.add(i);
      }
      const step = (_a: number, b: number) => !blocked.has(b);
      const nav = new Navigation(8, step);
      const distances = new Array(64).fill(Infinity); distances[0] = 0;
      const done = new Set<number>();
      for (let iteration = 0; iteration < 64; iteration++) {
        let best = -1;
        for (let i = 0; i < 64; i++) if (!done.has(i) && (best < 0 || distances[i] < distances[best])) best = i;
        if (best < 0 || !Number.isFinite(distances[best])) break;
        done.add(best);
        for (let next = 0; next < 64; next++) {
          if (!canTraverse(8, best, next, step)) continue;
          const diagonal = next % 8 !== best % 8 && Math.floor(next / 8) !== Math.floor(best / 8);
          distances[next] = Math.min(distances[next], distances[best] + (diagonal ? 1414 : 1000));
        }
      }
      const path = nav.path(0, 63);
      let cost = path ? 0 : Infinity, prior = 0;
      for (const next of path ?? []) {
        cost += next % 8 !== prior % 8 && Math.floor(next / 8) !== Math.floor(prior / 8) ? 1414 : 1000;
        prior = next;
      }
      expect(cost).toBe(distances[63]);
    }
  });
  it("charges diagonal distance and rechecks a newly obstructed corner at execution", () => {
    for (const diagonal of [false, true]) {
      const g = game(), w = worker(g);
      w.x = 100; w.y = 100;
      expect(g.context.spatial.route(w, {x: 110, y: diagonal ? 110 : 100})).toBe(true);
      let ticks = 0;
      while (w.unit!.route.length && ticks < 100) {g.context.move(); ticks++;}
      expect(ticks).toBe(diagonal ? 71 : 50);
      expect([w.x, w.y]).toEqual([110, diagonal ? 110 : 100]);
    }
    const g = game(), w = worker(g);
    w.x = 100; w.y = 100;
    g.context.spatial.route(w, {x: 101, y: 101});
    g.context.spatial.occupied[cell({x: 101, y: 100})] = 999;
    for (let i = 0; i < 8; i++) g.context.move();
    expect([w.x, w.y]).toEqual([100, 100]);
    expect(w.unit!.route).toEqual([]);
  });
});

// Movement geometry tests use a fixed speed independently of balance tuning.
function game() { return baseGame([], draft => { for (const set of draft.behaviorSets as any[]) if (set.behaviors.movement) set.behaviors.movement.speed = 8; }); }

it('rejects an occupied or unit-enclosed destination without flooding the map',()=>{
 let probes=0;const n=128,nav=new Navigation(n,()=>{probes++;return true}),goal=64*n+64;
 expect(nav.path(0,goal,new Set([goal]))).toBeNull();expect(probes).toBe(0);
 const ring=new Set<number>();for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++)if(x||y)ring.add(goal+y*n+x);
 expect(nav.path(0,goal,ring)).toBeNull();expect(probes).toBeLessThan(40);
 // A start inside the ring may still step directly into the destination.
 expect(nav.path(goal+1,goal,ring)).toEqual([goal]);
});

it('rejects a small enclosed goal region, while allowing its exit to reopen',()=>{
 const n=128,goal=64*n+64,ring=new Set<number>();let probes=0;
 for(let y=-4;y<=4;y++)for(let x=-4;x<=4;x++)if(Math.max(Math.abs(x),Math.abs(y))===4)ring.add(goal+y*n+x);
 const nav=new Navigation(n,()=>{probes++;return true});
 expect(nav.path(0,goal,ring)).toBeNull();expect(probes).toBeLessThan(5000);
 ring.delete(goal-4*n);expect(nav.path(0,goal,ring)?.at(-1)).toBe(goal);
});
