import {splitFormSchema,containmentSchema,heroReturnSchema,triggerTimerSchema,triggerCooldownSchema,lifecycleReactionSchema,abilityStateSchema,spellStatusSchema,spellDeliverySchema,spellInstanceSchema,spellVisionSchema,summonedSchema} from '../abilities/state';
import {missionStateSchema} from "../../shared/scenario/schema";
import { missileSchema } from "./missileState";
import { shellSchema } from "./shellState";
import { permanentBonusesSchema, itemRuntimeSchema, itemStatusSchema } from "../../content/items";
import { z } from "zod";
import {
  stockSchema,
  ownerSchema,
  idSchema,
  pointSchema,
  surfaceSchema,
} from "../../content/schema";

const positive = z.number().int().positive(),
  natural = z.number().int().nonnegative();
const point = pointSchema;
export const MAX_QUEUED_ORDERS = 16;
export const orderSchema = z.discriminatedUnion("type", [
  z.object({type:z.literal("garrison"),target:positive}).strict(),
  z.object({type:z.literal("hold")}).strict(),
  z.object({type:z.literal("patrol"),destination:point,origin:point.optional()}).strict(),
  z.object({type:z.literal("follow"),target:positive,escort:z.literal(true).optional()}).strict(),
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
    surface: surfaceSchema.optional(),
    rotation: z.number().finite(),
    hp: natural.nullable(),
    inventory: stockSchema,
    slows: z.array(z.object({permille: positive.max(800), expires: natural}).strict()).max(800).optional(),
    upgrade: z.object({target: idSchema, progress: natural}).strict().optional(),
    research: z.object({queue: z.array(z.object({id: idSchema, progress: natural}).strict()).max(12)}).strict().optional(),
    progression: z.object({ experience: natural, bonuses:permanentBonusesSchema.optional() }).strict().optional(),
    regeneration: z.object({ health: natural.max(39999), mana: natural.max(39999) }).strict().optional(),
    fallen: z.literal(true).optional(),
    spellSplit:splitFormSchema.optional(),
    spellContainment:containmentSchema.optional(),
    spellReturn:heroReturnSchema.optional(),
    spellTriggerCooldowns:triggerCooldownSchema.optional(),
    spellTriggerTimers:triggerTimerSchema.optional(),
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
    abilities: abilityStateSchema.optional(),
    spellCounters:z.record(z.string().max(220),z.number().int().min(0).max(99)).refine(v=>Object.keys(v).length<=128).optional(),
    spellStatuses:z.array(spellStatusSchema).max(32).optional(),
    summoned:summonedSchema.optional(),
    stunnedUntil: natural.optional(),
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
        route: z.array(natural.max(1048575)),
        lastMovedTick: natural.optional(),
        detour: z.object({
          goal:natural.max(1048575),
          waypoint:natural.max(1048575),
          yielding:z.object({leader:positive,until:natural}).strict().optional(),
          points:z.array(z.object({x:natural.max(511000),y:natural.max(511000),surface:surfaceSchema.optional()}).strict()).min(1).max(256),
        }).strict().optional(),
        goal: natural.max(1048575).nullable(),
        position: z
          .object({ x: natural.max(511000), y: natural.max(511000), surface: surfaceSchema.optional() })
          .strict()
          .nullable(),
        segment: z
          .object({
            from: z
              .object({ x: natural.max(511000), y: natural.max(511000), surface: surfaceSchema.optional() })
              .strict(),
            to: natural.max(1048575),
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
        garrison: z.object({building:positive,height:z.number().positive().max(32)}).strict().optional(),
        flight:z.object({height:z.number().min(1).max(30),source:z.object({ability:idSchema,status:z.string().min(1).max(48),cast:positive,rank:z.number().int().min(1).max(10),started:natural}).strict().optional()}).strict().optional(),
        release: point.nullable(),
        target: positive.nullable(),
        pursuit: z.object({target:positive,position:point,seenTick:natural}).strict().optional(),
        cooldown: natural,
        attack: z.object({profile:idSchema.optional(),target: positive, cycleTicks: positive, started: natural, impact: natural, ends: natural, released: z.boolean()}).strict().optional(),
        charge: z.object({profile:idSchema.optional(),readyTick: natural, expires: natural, target: positive.nullable()}).strict().optional(),
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
        // `target` rallies onto a resource (harvesters gather) or friendly unit (spawns follow).
        rally: point.extend({ target: positive.optional() }).nullable(),
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
/** Dead non-hero units remain queryable without occupying cells or contributing supply. */
export const corpseSchema=z.object({
 id:positive,definition:idSchema,owner:ownerSchema,position:pointSchema,rotation:z.number().finite(),
 died:natural,expires:natural,camp:z.string().min(1).max(100).optional(),
 progression:entitySchema.shape.progression,
 abilities:abilityStateSchema.optional(),
}).strict();
export type Corpse=z.infer<typeof corpseSchema>;
export const stateSchema = z
  .object({
    tick: natural,
    mission: missionStateSchema.optional(),
    random: positive.max(0xffffffff),
    clearedCamps: z.array(z.string().min(1)),
    nextMissile: positive,
    missiles: z.array(missileSchema),
    nextShell: positive,
    shells: z.array(shellSchema),
    nextCast: positive,
    corpses:z.array(corpseSchema).max(512).default([]),
    spellLifecycleReactions:z.array(lifecycleReactionSchema).max(512).default([]),
    spellCombatEvents:z.array(z.object({source:positive,target:positive,damage:natural,weapon:z.boolean(),melee:z.boolean()}).strict()).max(2048).default([]),
    nextSpellVision:positive.default(1),
    spellVisions:z.array(spellVisionSchema).max(256).default([]),
    spellInstances:z.array(spellInstanceSchema).max(512).default([]),
    spellDeliveries:z.array(spellDeliverySchema).max(512).default([]),
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
  nextCast: 1,
  corpses: [],
  spellLifecycleReactions: [],
  spellCombatEvents: [],
  nextSpellVision: 1,
  spellVisions: [],
  spellInstances: [],
  spellDeliveries: [],
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
