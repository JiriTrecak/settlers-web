import {snapPlacement} from '../../src/shared/spatial/placement';
import { builtinSource, content } from "../../src/content/builtin";
import { ContentRegistry } from "../../src/content/registry";
import { emptyUtcMap } from "../../src/shared/map/utcmap";
import { Game } from "../../src/sim/game/game";
import type { Placement, Rules, AuthoredDefinition } from "../../src/content/schema";
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
/** Deliberately tiny bodies/speeds for sub-cell navigation algorithm fixtures.
 * These are test content, independent of the shipped balance and model sizes. */
export function compactBodySource(draft: ReturnType<typeof source>) {
  for(const d of draft.definitions as AuthoredDefinition[])if(d.kind==='unit') {
    d.dimensions={radius:.2,height:2,formationSpacing:1};
    const resolved=content.get(d.id).behaviors;
    d.behaviors??={};
    if(resolved.movement)d.behaviors.movement={...resolved.movement,speed:4,...(resolved.movement.walkSpeed?{walkSpeed:2}:{})};
    if(resolved.combat&&!resolved.combat.projectile&&!resolved.combat.shell)d.behaviors.combat={...resolved.combat,range:1.5,attack:{...resolved.combat.attack,rangeBuffer:.75}};
  }
}
export function compactBodyGame(entities: Placement[] = [], edit?: (draft: ReturnType<typeof source>) => void) {
  return game(entities, draft => { compactBodySource(draft); edit?.(draft); });
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
    // Custom fixture definitions supply their own legal coordinates.
    position: content.find(definition) ? snapPlacement(content.get(definition), {x,y}) : {x,y},
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
    Object.values(g.state.wallets).reduce((sum, wallet) => sum + (wallet[item] ?? 0), 0),
  );
}
