import {heading} from '../../src/sim/game/facing';
import { describe, expect, it } from 'vitest';
import { game as baseGame, worker } from './helpers';
import { cell, point } from '../../src/sim/game/spatial';
import { atPoint, clearRay, fixed, precise } from '../../src/sim/game/motion';

function setup() {
  const g = game(), w = worker(g);
  w.x = 100; w.y = 100;w.rotation=heading(w,{x:113,y:107});
  return {g, w};
}

describe('continuous arbitrary-angle movement', () => {
  it('follows a non-cardinal, non-diagonal straight line each tick, including rendered positions', () => {
    const {g, w} = setup();
    const destination = {x: 113, y: 107};
    expect(g.context.spatial.route(w, destination)).toBe(true);
    expect(w.unit!.route).toEqual([cell(destination)]);
    let ticks = 0;
    while (w.unit!.route.length && ticks < 100) {
      g.context.move(); g.observation.update(); ticks++;
      const pos = precise(w);
      // Fixed-point rounding stays below a hundredth of one grid cell over the whole trip.
      expect(Math.abs((pos.x - 100) * 7 - (pos.y - 100) * 13)).toBeLessThan(.02);
      const view = g.view('player.1').entities.find(e => e.id === w.id)!;
      expect([view.x, view.y]).toEqual([pos.x, pos.y]);
    }
    expect(ticks).toBeGreaterThanOrEqual(74);
    expect(ticks).toBeLessThanOrEqual(75);
    expect(atPoint(w, destination)).toBe(true);
  });
  it('stops and retargets mid-cell without snapping to a grid center', () => {
    const {g, w} = setup();
    g.context.spatial.route(w, {x: 113, y: 107});
    g.context.move();
    const stopped = {...w.unit!.position!};
    expect(stopped.x % 1000).not.toBe(0);
    g.command('player.1', {type: 'stop', actors: [w.id]});
    g.context.move();
    expect(w.unit!.position).toEqual(stopped);
    const destination = {x: 98, y: 112};
    g.context.spatial.route(w, destination);
    expect(w.unit!.position).toEqual(stopped);
    for (let i = 0; i < 100 && w.unit!.route.length; i++) g.context.move();
    expect(atPoint(w, destination)).toBe(true);
  });
  it('uses clear waypoints around a wall and checks the swept body on every step', () => {
    const {g, w} = setup(), spatial = g.context.spatial;
    for (let y = 97; y <= 105; y++) spatial.occupied[cell({x: 105, y})] = 999;
    const destination = {x: 113, y: 102};
    expect(spatial.route(w, destination)).toBe(true);
    expect(w.unit!.route.length).toBeGreaterThan(1);
    let anchor = fixed(w);
    for (const waypoint of w.unit!.route) {
      expect(spatial.clearSegment(anchor, fixed(point(waypoint)))).toBe(true);
      anchor = fixed(point(waypoint));
    }
    for (let i = 0; i < 180 && w.unit!.route.length; i++) {
      const before = {...w.unit!.position!}; g.context.move();
      expect(spatial.clearSegment(before, w.unit!.position!)).toBe(true);
    }
    expect(atPoint(w, destination)).toBe(true);
  });
  it('saves precise progress and resumes with identical movement and checksum', () => {
    const {g, w} = setup();
    g.context.spatial.route(w, {x: 113, y: 107});
    for (let i = 0; i < 17; i++) g.context.move();
    const restored = game(); restored.restore(g.snapshot());
    for (let i = 0; i < 90; i++) {
      g.context.move(); restored.context.move();
      expect(restored.snapshot().state).toEqual(g.snapshot().state);
    }
  });
  it('supercover catches exact corner crossings and out-of-map rays', () => {
    expect(clearRay(fixed({x: 1, y: 1}), fixed({x: 4, y: 4}), (_a,b) => b !== cell({x: 2, y: 1}))).toBe(false);
    expect(clearRay({x: -1000, y: 1000}, fixed({x: 4, y: 4}), () => true)).toBe(false);
  });
});

// Movement geometry tests use a fixed speed independently of balance tuning.
function game() { return baseGame([], draft => { for (const set of draft.behaviorSets as any[]) if (set.behaviors.movement) set.behaviors.movement.speed = 8; }); }
