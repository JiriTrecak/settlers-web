import { z } from "zod";
const n = z.number().int().nonnegative();
/** Reusable item effect vocabulary. No simulation or UI dispatches on item IDs. */
export const itemModifiersSchema = z.object({
  maxHp: n.optional(), maxMana: n.optional(), damage: n.optional(), armor: n.optional(),
  healthRegenPerSecond: z.number().nonnegative().optional(), manaRegenPerSecond: z.number().nonnegative().optional(),
  damagePermille: n.max(1000).optional(), attackSpeedPermille: z.number().int().min(-800).max(1000).optional(),
  moveSpeedPermille: z.number().int().min(-800).max(1000).optional(), cooldownReductionPermille: n.max(500).optional(),
  lifestealPermille: n.max(500).optional(), rooted: z.boolean().optional(), controlImmune: z.boolean().optional(),
  invulnerable: z.boolean().optional(),
}).strict();
const status = z.object({durationTicks: n.positive(), modifiers: itemModifiersSchema, shield: n.optional()}).strict();
const active = z.object({
  cooldownTicks: n, charges: n.positive().optional(),
  target: z.enum(["self", "allies", "enemies"]), radius: n.max(32),
  heal: n.optional(), mana: n.optional(), healMaxPermille: n.max(1000).optional(),
  damage: n.optional(), damageType: z.string().optional(), status: status.optional(),
  reduceAbilityCooldownTicks: n.optional(),
}).strict();
const extras = {
  modifiers: itemModifiersSchema.optional(),
  aura: z.object({radius: n.positive().max(32), target: z.enum(["allies", "enemies"]), modifiers: itemModifiersSchema}).strict().optional(),
  active: active.optional(),
  onHit: z.object({every: n.positive(), radius: n.positive().max(32), targets: n.positive().max(16), damage: n.optional(), attackDamagePermille: n.max(1000).optional(), damageType: z.string()}).strict().optional(),
  rescue: z.object({healMaxPermille: n.positive().max(1000), invulnerableTicks: n.positive(), charges: n.positive()}).strict().optional(),
};
export const itemEffectSchema = z.discriminatedUnion("type", [
  z.object({type: z.literal("equipment"), damage: n, armor: n, maxHp: n, ...extras}).strict(),
  z.object({type: z.literal("consumable"), heal: n, ...extras}).strict(),
]);
export const itemRuntimeSchema = z.object({charges: n.optional(), readyTick: n, hits: n}).strict();
export const itemStatusSchema = z.object({item: z.string(), source: n.positive(), kind: z.enum(["aura", "active", "rescue"]), expires: n, shield: n.optional()}).strict();
export type ItemModifiers = z.infer<typeof itemModifiersSchema>;
export type ItemEffect = z.infer<typeof itemEffectSchema>;
export type ItemRuntime = z.infer<typeof itemRuntimeSchema>;
