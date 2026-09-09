import {z} from 'zod';
const n=z.number().int().nonnegative(),positive=z.number().int().positive();
/** A small set of explicit effect algorithms, parameterized by authored ranks. */
export const spellSchema=z.object({
 name:z.string().min(1),description:z.string(),icon:z.string().min(1),hotkey:z.string().min(1),priority:n,
 target:z.enum(['point','self']),effect:z.enum(['line','blast','rally','guard']),
 damageType:z.string().min(1),visual:z.string().min(1),
 ranks:z.array(z.object({
  requiredLevel:positive.max(10),mana:n,cooldownTicks:positive,castTicks:positive,
  range:n.max(64),radius:n.max(32),damage:n,stunTicks:n.max(400),
  durationTicks:n,damageBonus:n,reductionPermille:n.max(900),
 }).strict()).min(1).max(3),
}).strict();
export type Spell= z.infer<typeof spellSchema>;

export const spellVisualSchema=z.object({color:z.string().regex(/^#[0-9a-fA-F]{6}$/),accent:z.string().regex(/^#[0-9a-fA-F]{6}$/),durationTicks:positive.max(200),particles:n.max(64),particleSize:z.number().positive().max(1),rise:z.number().nonnegative().max(10)}).strict();
export type SpellVisual = z.infer<typeof spellVisualSchema>;
