import { missileSchema } from "./missileState";
import { shellSchema } from "./shellState";
import { itemRuntimeSchema, itemStatusSchema } from "../../content/items";
import { visualCueSchema } from "./visualCues";
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
export const MAX_QUEUED_ORDERS = 16;
export const orderSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("construct"), target: positive }).strict(),
  z.object({ type: z.literal("gather"), target: positive }).strict(),
  z.object({ type: z.literal("pickup"), target: positive }).strict(),
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
export const fellingStateSchema = z.object({
  hp: natural,
  lastHitTick: natural.nullable(),
  fallTick: natural.nullable(),
  direction: z.object({x: z.number().finite(), y: z.number().finite()}).strict(),
}).strict();
export const entitySchema = z
  .object({
    id: positive,
    readyTick: natural,
    placement: z.string().nullable(),
    definition: idSchema,
    owner: ownerSchema,
    x: z.number().int().min(0).max(511),
    y: z.number().int().min(0).max(511),
    rotation: z.number().finite(),
    hp: natural.nullable(),
    inventory: stockSchema,
    slows: z.array(z.object({permille: positive.max(800), expires: natural}).strict()).max(800).optional(),
    upgrade: z.object({target: idSchema, progress: natural}).strict().optional(),
    research: z.object({queue: z.array(z.object({id: idSchema, progress: natural}).strict()).max(12)}).strict().optional(),
    progression: z.object({ experience: natural }).strict().optional(),
    regeneration: z.object({ health: natural.max(39999), mana: natural.max(39999) }).strict().optional(),
    fallen: z.literal(true).optional(),
    revival: z
      .object({
        queue: z.array(
          z.object({ hero: positive, progress: natural }).strict(),
        ),
      })
      .strict()
      .optional(),
    equipmentState: z.array(itemRuntimeSchema.nullable()).max(12).optional(),
    itemHits: z.array(z.object({item: idSchema, source: positive, target: positive, damage: natural, damageType: idSchema}).strict()).max(512).optional(),
    itemStatuses: z.array(itemStatusSchema).max(128).optional(),
    equipment: z.array(idSchema.nullable()).max(12).optional(),
    spellcasting: z
      .object({
        mana: natural,
        learned: z.record(idSchema, natural.max(3)),
        cooldowns: z.record(idSchema, natural),
        pending: z
          .object({
            ability: idSchema,
            rank: positive.max(3),
            point,
            resolveTick: natural,
          })
          .strict()
          .nullable(),
      })
      .strict()
      .optional(),
    effects: z
      .array(
        z
          .object({
            ability: idSchema,
            source: positive,
            expires: natural,
            rank: positive.max(3),
          })
          .strict(),
      )
      .optional(),
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
        orderQueue: z.array(orderSchema).max(MAX_QUEUED_ORDERS),
        route: z.array(natural.max(262143)),
        goal: natural.max(262143).nullable(),
        position: z
          .object({ x: natural.max(511000), y: natural.max(511000) })
          .strict()
          .nullable(),
        segment: z
          .object({
            from: z
              .object({ x: natural.max(511000), y: natural.max(511000) })
              .strict(),
            to: natural.max(262143),
            length: positive,
            progress: natural,
          })
          .strict()
          .nullable(),
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
        attack: z.object({target: positive, started: natural, impact: natural, ends: natural, released: z.boolean()}).strict().optional(),
        charge: z.object({readyTick: natural, expires: natural, target: positive.nullable()}).strict().optional(),
        camp: z.string().nullable(),
        returning: z.boolean(),
        retryAt: natural,
        idle: z
          .object({ home: point, nextTick: natural, walking: z.boolean() })
          .strict()
          .nullable(),
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
      .object({ amount: natural, growingUntil: natural.nullable(), felling: fellingStateSchema.optional() })
      .strict()
      .optional(),
    item: z.object({ quantity: positive, runtime: itemRuntimeSchema.optional() }).strict().optional(),
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
      "recruit",
    ]),
    worker: positive,
    target: positive,
    source: positive.nullable(),
    item: idSchema.nullable(),
    amount: natural,
    phase: z.enum(["walk", "work", "fall", "return"]),
    progress: natural,
    queue: positive.nullable(),
  })
  .strict();
export const factSchema = z
  .object({
    id: positive,
    tick: natural,
    owner: ownerSchema,
    type: z.enum([
      "command",
      "error",
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
    random: positive.max(0xffffffff),
    clearedCamps: z.array(z.string().min(1)),
    nextMissile: positive,
    missiles: z.array(missileSchema),
    nextShell: positive,
    shells: z.array(shellSchema),
    nextVisual: positive,
    visuals: z.array(visualCueSchema),
    nextId: positive,
    nextJob: positive,
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
    facts: z.array(factSchema),
    objectives: z.record(ownerSchema, positive),
    research: z.record(ownerSchema, z.array(idSchema)),
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
export type UnitOrder = z.infer<typeof orderSchema>;
export type Job = z.infer<typeof jobSchema>;
export type Fact = z.infer<typeof factSchema>;
export type GameState = z.infer<typeof stateSchema>;
export type Point = z.infer<typeof point>;
export type QueueEntry = z.infer<typeof queueSchema>;
export const emptyState = (): GameState => ({
  tick: 0,
  random: 1,
  clearedCamps: [],
  nextMissile: 1,
  missiles: [],
  nextShell: 1,
  shells: [],
  nextVisual: 1,
  visuals: [],
  nextId: 1,
  nextJob: 1,
  nextQueue: 1,
  nextFact: 1,
  entities: [],
  accounting: { produced: {}, consumed: {}, lost: {} },
  jobs: [],
  facts: [],
  objectives: {},
  research: {},
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
