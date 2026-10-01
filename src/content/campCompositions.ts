import {z} from "zod";
import raw from "../../content/neutral-camps.json";

/** Themed neutral camp families (content/neutral-camps.json). The editor stamps one as a whole
 * camp: every member placement plus a single camp record, so a composition is authored once. */
const slug = z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
const compositionSchema = z
  .object({
    id: slug,
    name: z.string().min(1),
    difficulty: z.enum(["small", "medium", "hard"]),
    theme: z.string().min(1),
    members: z.record(slug, z.number().int().positive().max(12)),
  })
  .strict();
export type CampComposition = z.infer<typeof compositionSchema>;
export type CampDifficulty = CampComposition["difficulty"];

export const campCompositions: readonly CampComposition[] = z.array(compositionSchema).parse(raw);
export const CAMP_LOOT: Record<CampDifficulty, string> = {
  small: "loot.camp.easy",
  medium: "loot.camp.medium",
  hard: "loot.camp.hard",
};

export function campComposition(id: string): CampComposition {
  const found = campCompositions.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown camp composition: ${id}`);
  return found;
}

/** Member definitions in placement order: strongest first (level, then HP), so the leader takes the camp centre. */
export function compositionMembers(composition: CampComposition, strength: (definition: string) => number): string[] {
  return Object.entries(composition.members)
    .flatMap(([member, count]) => Array.from({length: count}, () => `unit.neutral.${member}`))
    .sort((a, b) => strength(b) - strength(a) || (a < b ? -1 : a > b ? 1 : 0));
}
