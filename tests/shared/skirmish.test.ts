import { describe, it, expect } from "vitest";
import {
  createSkirmishMatch,
  defaultSlots,
  setLocalController,
} from "../../src/shared/match/skirmish";
import { emptyUtcMap } from "../../src/shared/map/utcmap";
import { World } from "../../src/sim/world/world";
import { testContent } from "../fixtures/content";
import { rulesSchema } from "../../src/content/schema";
import gameSource from "../../content/game.json";

// ENGINE-COUPLED: createSkirmishMatch validates races and fills default heroes from shipped content/game.json with no
// injection point. Expected defaults are read from that same source; the simulated worlds use the test registry with
// the lobby race/hero stripped (they default to the test world's race and hero).
const shipped = rulesSchema.parse(gameSource.rules);
const testSlots = (slots: readonly { race?: string; hero?: string }[]) =>
  slots.map(({ race: _race, hero: _hero, ...slot }) => slot) as any;

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
      { player: 0, kind: "ai", name: "Computer 1", hero: shipped.startingSetup.hero!.default, race: shipped.defaultRace },
      { player: 1, kind: "human", name: "Alice", hero: shipped.startingSetup.hero!.default, race: shipped.defaultRace },
    ]);
    const world = new World({ map, slots: testSlots(match.slots), seed: 1, registry: testContent });
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
    const world = new World({ map, slots: testSlots(match.slots), seed: 1, registry: testContent });
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
});
