import type { ContentRegistry } from "./registry";
import type { Definition, Owner } from "./schema";

type PrerequisiteEntity = {
  definition: string;
  owner: Owner;
  hp: number | null;
  construction?: unknown;
  remembered?: boolean;
};

/** Purchase gates only: paid tasks keep running if their prerequisite is lost. */
export function prerequisiteReason(
  definition: Pick<Definition, "requires">,
  owner: Owner,
  entities: readonly PrerequisiteEntity[],
  registry: ContentRegistry,
): string | undefined {
  if (!definition.requires) return undefined;
  const complete = new Set(entities.filter(e =>
    e.owner === owner && !e.remembered && !e.construction &&
    (e.hp === null || e.hp > 0),
  ).map(e => e.definition));
  const missing = definition.requires.filter(id => !complete.has(id));
  return missing.length ? `Requires ${missing.map(id => registry.get(id).name).join(", ")}` : undefined;
}
