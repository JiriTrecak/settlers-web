import { z } from "zod";
import {
  stockSchema,
  ownerSchema,
  idSchema,
  pointSchema,
} from "../../content/schema";

const positive = z.number().int().positive(),
  natural = z.number().int().nonnegative();
const point = pointSchema;
const orderSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("move"),
      destination: point,
      attackMove: z.boolean(),
    })
    .strict(),
  z
    .object({ type: z.literal("attack"), target: positive, force: z.boolean() })
    .strict(),
]);
export const queueSchema = z
  .object({ id: positive, definition: idSchema })
  .strict();
export const entitySchema = z
  .object({
    id: positive,
    readyTick: natural,
    placement: z.string().nullable(),
    definition: idSchema,
    owner: ownerSchema,
    x: z.number().int().min(0).max(255),
    y: z.number().int().min(0).max(255),
    rotation: z.number().finite(),
    hp: natural.nullable(),
    inventory: stockSchema,
    appearance: z
      .object({
        asset: idSchema.optional(),
        scale: z.number().positive().optional(),
      })
      .strict()
      .optional(),
    construction: z
      .object({ progress: natural, supportedHp: positive })
      .strict()
      .optional(),
    unit: z
      .object({
        order: orderSchema.nullable(),
        route: z.array(natural.max(65535)),
        goal: natural.max(65535).nullable(),
        position: z.object({x: natural.max(255000), y: natural.max(255000)}).strict().nullable(),
        segment: z.object({
          from: z.object({x: natural.max(255000), y: natural.max(255000)}).strict(),
          to: natural.max(65535), length: positive, progress: natural,
        }).strict().nullable(),
        employment: positive.nullable(),
        job: positive.nullable(),
        cargo: z
          .object({ item: idSchema, amount: positive })
          .strict()
          .nullable(),
        pendingMove: point.nullable(),
        contained: positive.nullable(),
        release: point.nullable(),
        target: positive.nullable(),
        cooldown: natural,
        camp: z.string().nullable(),
        returning: z.boolean(),
        retryAt: natural,
        idle: z.object({ home: point, nextTick: natural, walking: z.boolean() }).strict().nullable(),
      })
      .strict()
      .optional(),
    production: z
      .object({
        paused: z.boolean(),
        queue: z.array(queueSchema),
        active: z
          .object({
            definition: idSchema,
            queue: positive.nullable(),
            worker: positive.nullable(),
            progress: natural,
          })
          .strict()
          .nullable(),
        staff: positive.nullable(),
        produced: natural,
        rally: point.nullable(),
        status: z.string(),
      })
      .strict()
      .optional(),
    resource: z
      .object({ amount: natural, growingUntil: natural.nullable() })
      .strict()
      .optional(),
    item: z.object({ quantity: positive }).strict().optional(),
  })
  .strict();
export const jobSchema = z
  .object({
    id: positive,
    type: z.enum([
      "deliver",
      "construct",
      "repair",
      "harvest",
      "plant",
      "craft",
      "recruit",
    ]),
    worker: positive,
    target: positive,
    source: positive.nullable(),
    item: idSchema.nullable(),
    amount: natural,
    phase: z.enum(["pickup", "walk", "work", "return"]),
    progress: natural,
    queue: positive.nullable(),
    claim: positive.nullable(),
    internal: z.boolean(),
  })
  .strict();
export const claimSchema = z
  .object({
    id: positive,
    source: positive,
    target: positive,
    item: idSchema,
    amount: positive,
    queue: positive.nullable(),
    worker: positive.nullable(),
    picked: z.boolean(),
    internal: z.boolean(),
  })
  .strict();
export const factSchema = z
  .object({
    id: positive,
    tick: natural,
    owner: ownerSchema,
    type: z.enum([
      "command",
      "produced",
      "consumed",
      "lost",
      "death",
      "released",
    ]),
    message: z.string(),
    item: idSchema.optional(),
    amount: positive.optional(),
  })
  .strict();
export const stateSchema = z
  .object({
    tick: natural,
    nextId: positive,
    nextJob: positive,
    nextClaim: positive,
    nextQueue: positive,
    nextFact: positive,
    entities: z.array(entitySchema),
    accounting: z
      .object({
        produced: stockSchema,
        consumed: stockSchema,
        lost: stockSchema,
      })
      .strict(),
    jobs: z.array(jobSchema),
    claims: z.array(claimSchema),
    facts: z.array(factSchema),
    objectives: z.record(ownerSchema, positive),
    outcome: z
      .object({
        winner: ownerSchema.nullable(),
        defeated: z.array(ownerSchema),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type Entity = z.infer<typeof entitySchema>;
export type Job = z.infer<typeof jobSchema>;
export type Claim = z.infer<typeof claimSchema>;
export type Fact = z.infer<typeof factSchema>;
export type GameState = z.infer<typeof stateSchema>;
export type Point = z.infer<typeof point>;
export type QueueEntry = z.infer<typeof queueSchema>;
export const emptyState = (): GameState => ({
  tick: 0,
  nextId: 1,
  nextJob: 1,
  nextClaim: 1,
  nextQueue: 1,
  nextFact: 1,
  entities: [],
  accounting: { produced: {}, consumed: {}, lost: {} },
  jobs: [],
  claims: [],
  facts: [],
  objectives: {},
  outcome: null,
});
export const quantity = (stock: Record<string, number>, id: string) =>
  stock[id] ?? 0;
export const total = (stock: Record<string, number>) =>
  Object.values(stock).reduce((a, b) => a + b, 0);
export const add = (stock: Record<string, number>, id: string, n: number) => {
  const next = quantity(stock, id) + n;
  if (next < 0) throw new Error(`Negative inventory ${id}`);
  if (next) stock[id] = next;
  else delete stock[id];
};
export const alive = (e: Entity) => e.hp === null || e.hp > 0;
