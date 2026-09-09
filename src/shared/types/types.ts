import { z } from "zod";
import { idSchema, pointSchema } from "../../content/schema";
export type GridPos = z.infer<typeof pointSchema>;
const actor = z.number().int().positive();
const actors = z
  .array(actor)
  .min(1)
  .max(160)
  .refine((xs) => new Set(xs).size === xs.length, "Duplicate actors");
/** The only client-writable gameplay intentions. Costs, damage, ownership and job internals never cross here. */
export const actionSchema = z.discriminatedUnion("type", [
  z.object({type:z.literal("revive"),actor,hero:actor}).strict(),
  z.object({type:z.literal("cancelRevival"),actor,hero:actor}).strict(),
  z.object({type:z.literal("learnAbility"),actor:z.number().int().positive(),ability:z.string().min(1)}).strict(),
  z.object({type:z.literal("cast"),actor:z.number().int().positive(),ability:z.string().min(1),point:pointSchema.optional()}).strict(),
  z.object({type:z.literal("gather"),actors:z.array(z.number().int().positive()).min(1),target:z.number().int().positive()}).strict(),
  z.object({type:z.literal("pickup"),actor,target:actor}).strict(),
  z.object({type:z.literal("dropItem"),actor,slot:z.number().int().min(0).max(11)}).strict(),
  z.object({type:z.literal("useItem"),actor,slot:z.number().int().min(0).max(11)}).strict(),
  z
    .object({
      type: z.literal("move"),
      actors,
      destination: pointSchema,
      attackMove: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("attack"),
      actors,
      target: actor,
      force: z.boolean().optional(),
    })
    .strict(),
  z.object({ type: z.literal("stop"), actors }).strict(),
  z
    .object({
      type: z.literal("build"),
      actor,
      definition: idSchema,
      position: pointSchema,
      rotation: z.number().int().multipleOf(90).optional(),
    })
    .strict(),
  z
    .object({ type: z.literal("produce"), actor, definition: idSchema })
    .strict(),
  z
    .object({ type: z.literal("cancel"), actor, queue: actor.optional() })
    .strict(),
  z
    .object({ type: z.literal("rally"), actor, destination: pointSchema })
    .strict(),
  z.object({ type: z.literal("pause"), actor, paused: z.boolean() }).strict(),
  z.object({ type: z.literal("noop") }).strict(),
  z.object({ type: z.literal("ping") }).strict(),
]);
export type Action = z.infer<typeof actionSchema>;
export const validAction = (value: unknown): value is Action =>
  actionSchema.safeParse(value).success;
