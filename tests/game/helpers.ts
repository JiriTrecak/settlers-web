import { builtinSource } from "../../src/content/builtin";
import { ContentRegistry } from "../../src/content/registry";
import { emptyUtcMap } from "../../src/shared/map/utcmap";
import { Game } from "../../src/sim/game/game";
import type { Placement, Rules } from "../../src/content/schema";
export const slots = [
  { player: 0, kind: "human" as const },
  { player: 1, kind: "human" as const },
];
export const source = () => structuredClone(builtinSource);
export function game(
  entities: Placement[] = [],
  edit?: (draft: ReturnType<typeof source>) => void,
) {
  const src = source();
  // Isolated scenarios issue their own jobs; startup gathering has separate integration coverage.
  (src.rules as Rules).startingSetup.gathering=[];
  edit?.(src);
  return new Game(
    { ...emptyUtcMap(), entities },
    slots,
    new ContentRegistry(src),
  );
}
export function placed(
  id: string,
  definition: string,
  x = 205,
  y = 210,
  initialState?: Placement["initialState"],
): Placement {
  return {
    id,
    definition,
    position: { x, y },
    rotation: 0,
    owner: "player.1",
    ...(initialState ? { initialState } : {}),
  };
}
export const run = (g: Game, n: number) => {
  for (let i = 0; i < n; i++) g.tick();
};
export const worker = (g: Game) =>
  g.entities.find(
    (e) =>
      e.owner === "player.1" && g.registry.get(e.definition).behaviors.work,
  )!;
export function physical(g: Game, item: string) {
  return g.entities.reduce(
    (n, e) =>
      n +
      (e.inventory[item] ?? 0) +
      (e.item && e.definition === item ? e.item.quantity : 0) +
      (e.unit?.cargo?.item === item ? e.unit.cargo.amount : 0),
    0,
  );
}
