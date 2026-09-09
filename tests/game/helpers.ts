import { builtinSource } from "../../src/content/builtin";
import { ContentRegistry } from "../../src/content/registry";
import { emptyUtcMap } from "../../src/shared/map/utcmap";
import { Game } from "../../src/sim/game/game";
import type { Placement, Rules, Definition } from "../../src/content/schema";
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

/** A synthetic producer exercises generic crafting without restoring a retired gameplay chain. */
export function craftGame(entities: Placement[] = [], edit?: (draft:ReturnType<typeof source>)=>void) {
  return game(entities,draft=>{
    const mill=(draft.definitions as Definition[]).find(d=>d.id==='building.ants.sawmill')!;
    mill.behaviors={storage:{capacity:16,accepts:['item.wood']},production:{mode:'automatic',outputs:['item.plank'],workerSlots:1,workRadius:28}};
    (draft.definitions as Definition[]).find(d=>d.id==='item.plank')!.creation={method:'craft',items:[{item:'item.wood',amount:1}],workTicks:120};
    edit?.(draft);
  });
}
