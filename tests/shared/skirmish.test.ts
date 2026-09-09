import { describe, it, expect } from "vitest";
import {
  createSkirmishMatch,
  defaultSlots,
  setLocalController,
} from "../../src/shared/match/skirmish";
import {
  emptyUtcMap,
  parseUtcMap,
  stringifyUtcMap,
} from "../../src/shared/map/utcmap";
import { World } from "../../src/sim/world/world";

describe("skirmish setup", () => {
  const map = emptyUtcMap();
  it("moves the human seat to P2 without changing map identities or spawn positions", () => {
    const slots = setLocalController(
      defaultSlots(map.playerStarts),
      1,
      "human",
    );
    const { match, player } = createSkirmishMatch(
      { mapId: "test", slots },
      map.playerStarts,
      "rev",
      "Alice",
    );
    expect(player).toBe(1);
    expect(match.slots).toEqual([
      { player: 0, kind: "ai", name: "Computer 1" },
      { player: 1, kind: "human", name: "Alice" },
    ]);
    const world = new World({ map, slots: match.slots, seed: 1 });
    const hall = world.settlement.entities.find(
      (e) => e.id === world.settlement.state.objectives["player.2"],
    )!;
    expect([hall.x, hall.y]).toEqual([
      map.playerStarts[1].x,
      map.playerStarts[1].z,
    ]);
    expect(world.aiSummary().map((a) => a.owner)).toEqual(["player.1"]);
  });
  it("runs both AI players without assigning the observer an owner", () => {
    const { match, player } = createSkirmishMatch(
      {
        mapId: "test",
        slots: setLocalController(defaultSlots(map.playerStarts), 0, "ai"),
      },
      map.playerStarts,
      "rev",
    );
    expect(player).toBeNull();
    const world = new World({ map, slots: match.slots, seed: 1 });
    for (let n = 0; n < 80; n++) world.tick();
    expect(world.aiSummary().map((a) => a.owner)).toEqual([
      "player.1",
      "player.2",
    ]);
    expect(new Set(world.log().map((a) => a.player))).toEqual(new Set([0, 1]));
  });
  it("retains every authored start, including more than two players", () => {
    const starts = [
      ...map.playerStarts,
      ...[3, 4, 5, 6, 7, 8].map((player) => ({
        ...map.playerStarts[0],
        player,
      })),
    ];
    const slots = defaultSlots(starts, 7);
    const result = createSkirmishMatch(
      { mapId: "eight", slots },
      starts,
      "rev",
    );
    expect(result.player).toBe(7);
    expect(result.match.slots).toHaveLength(8);
  });
  it("rejects missing participants, duplicate slots and multiple local humans", () => {
    const setup = { mapId: "test", slots: defaultSlots(map.playerStarts) };
    expect(() =>
      createSkirmishMatch(
        { ...setup, slots: setup.slots.slice(0, 1) },
        map.playerStarts,
        "r",
      ),
    ).toThrow();
    expect(() =>
      createSkirmishMatch(
        { ...setup, slots: [setup.slots[0], setup.slots[0]] },
        map.playerStarts,
        "r",
      ),
    ).toThrow();
    expect(() =>
      createSkirmishMatch(
        { ...setup, slots: setup.slots.map((s) => ({ ...s, kind: "human" })) },
        map.playerStarts,
        "r",
      ),
    ).toThrow();
    expect(() =>
      createSkirmishMatch(
        { ...setup, slots: setup.slots.slice(0, 1) },
        map.playerStarts.slice(0, 1),
        "r",
      ),
    ).toThrow();
  });
  it("round-trips optional map descriptions and rejects malformed metadata", () => {
    const described = { ...map, description: "An ancient woodland." };
    expect(
      parseUtcMap(JSON.parse(stringifyUtcMap(described)))?.description,
    ).toBe(described.description);
    expect(parseUtcMap(map)?.description).toBeUndefined();
    expect(parseUtcMap({ ...map, description: 99 })).toBeNull();
    expect(parseUtcMap({ ...map, description: "a".repeat(1201) })).toBeNull();
  });
});
