import { describe, expect, it } from "vitest";
import { localMatch, MAP_SIZE } from "../../src/shared";
import { startCell } from "../../src/sim/player/start";
import { World } from "../../src/sim/world/world";

describe("player entities", () => {
  it("one slot is one player at map center", () => {
    const match = localMatch({ mapId: "grid", mapRevision: "grid", seed: 1, slotCount: 1, me: 0 });
    const world = new World({ size: MAP_SIZE, slots: match.slots, seed: match.seed });
    expect(world.players).toHaveLength(1);
    expect(world.players[0]!.id).toBe(0);
    expect(world.players[0]!.pos).toEqual(startCell(0, 1, MAP_SIZE));
    expect(world.players[0]!.pos).toEqual({ x: 128, y: 128 });
  });

  it("n slots spawn n players on a ring, not a hardcoded P2 cell", () => {
    const match = localMatch({ mapId: "grid", mapRevision: "grid", seed: 1, slotCount: 2, me: 0 });
    const world = new World({ size: MAP_SIZE, slots: match.slots, seed: match.seed });
    expect(world.players).toHaveLength(2);
    expect(world.players[0]!.pos).toEqual(startCell(0, 2, MAP_SIZE));
    expect(world.players[1]!.pos).toEqual(startCell(1, 2, MAP_SIZE));
    expect(world.players[0]!.pos).not.toEqual(world.players[1]!.pos);
  });

  it("same slots + seed ⇒ same checksum", () => {
    const match = localMatch({ mapId: "grid", mapRevision: "grid", seed: 7, slotCount: 2, me: 0 });
    const a = new World({ size: MAP_SIZE, slots: match.slots, seed: 7 });
    const b = new World({ size: MAP_SIZE, slots: match.slots, seed: 7 });
    expect(a.checksum()).toBe(b.checksum());
    a.tick();
    expect(a.checksum()).not.toBe(b.checksum());
    b.tick();
    expect(a.checksum()).toBe(b.checksum());
  });
});
