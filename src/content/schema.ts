import { spellSchema, spellVisualSchema } from "./spells";
import { z } from "zod";

export const idSchema = z.string().regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/);
export const ownerSchema = z.union([
  z.literal("none"),
  z.string().regex(/^player\.[1-8]$/),
]);
export type Owner = z.infer<typeof ownerSchema>;
export const pointSchema = z
  .object({
    x: z.number().int().min(0).max(511),
    y: z.number().int().min(0).max(511),
  })
  .strict();
const natural = z.number().int().nonnegative();
const positive = z.number().int().positive();
export const stockSchema = z.record(idSchema, natural);
export const priceSchema = z.array(
  z.object({ item: idSchema, amount: positive }).strict(),
);
const work = positive;
export const creationSchema = z.discriminatedUnion("method", [
  z
    .object({
      method: z.literal("construct"),
      workAnimation: z.enum(["build", "chop"]).optional(),
      items: priceSchema,
      workTicks: work,
    })
    .strict(),
  z
    .object({
      method: z.literal("recruit"),
      items: priceSchema,
      unitInput: idSchema,
      workTicks: work,
    })
    .strict(),
  z
    .object({
      method: z.literal("harvest"),
      workAnimation: z.enum(["build", "chop"]).optional(),
      items: z.array(z.never()),
      source: idSchema,
      amount: positive.max(32),
      workTicks: work,
    })
    .strict(),
  z
    .object({
      method: z.literal("plant"),
      items: z.array(z.never()),
      workTicks: work,
    })
    .strict(),
  z
    .object({
      method: z.literal("spawn"),
      items: z.array(z.never()),
      workTicks: work,
    })
    .strict(),
]);
const movement = z
  .object({
    speed: positive.max(40),
    walkSpeed: positive.max(40).optional(),
    idleWander: z.boolean().optional(),
  })
  .strict();
const combat = z
  .object({
    damage: positive,
    damageType: idSchema,
    range: z.number().positive().max(64),
    cooldownTicks: positive,
    aggroRange: positive.max(64),
  })
  .strict();
const worker = z
  .object({
    carryCapacity: positive.max(32),
    builds: z.array(idSchema),
    harvests: z.array(idSchema).optional(),
  })
  .strict();
const storage = z
  .object({
    capacity: positive.max(1000000),
    accepts: z.array(idSchema),
    dropoff: z.boolean().optional(),
  })
  .strict();
const production = z
  .object({
    mode: z.enum(["automatic", "queued"]),
    outputs: z.array(idSchema).min(1),
    workerSlots: z.union([z.literal(0), z.literal(1)]),
    queueCapacity: positive.max(100).optional(),
    workRadius: positive.max(64).optional(),
    population: z
      .object({ capacity: positive.max(1000), intervalTicks: work })
      .strict()
      .optional(),
    jobName: z.string().optional(),
  })
  .strict();
const progression = z
  .object({
    levels: z.array(z.object({
      experience: natural,
      maxHp: positive,
      damage: natural,
      armor: natural,
      cooldownTicks: positive,
      maxMana: natural,
      healthRegenPerSecond: z.number().nonnegative().max(10000).multipleOf(0.001),
      manaRegenPerSecond: z.number().nonnegative().max(10000).multipleOf(0.001),
    }).strict()).min(1).max(50),
    experienceRadius: positive.max(64),
  })
  .strict();
const spellcasting = z
  .object({
    abilities: z.array(idSchema).min(1).max(8),
    learningCategory: idSchema,
    manaIcon: idSchema,
    maxMana: positive,
    manaRegenPerSecond: z.number().nonnegative().max(10000).multipleOf(0.001),
  })
  .strict();
const inventory = z
  .object({
    slots: positive.max(12),
    pickupRange: z.number().positive().max(4),
  })
  .strict();
const empty = z.object({}).strict();
export const behaviorSchema = z
  .object({
    movement: movement.optional(),
    playerControl: empty.optional(),
    combat: combat.optional(),
    work: worker.optional(),
    storage: storage.optional(),
    production: production.optional(),
    campDefense: empty.optional(),
    progression: progression.optional(),
    inventory: inventory.optional(),
    spellcasting: spellcasting.optional(),
    revival: z
      .object({ workTicks: positive, queueCapacity: positive.max(12) })
      .strict()
      .optional(),
  })
  .strict();
export const behaviorNames = Object.keys(
  behaviorSchema.shape,
) as (keyof z.infer<typeof behaviorSchema>)[];
const rawBehaviors = z
  .object({
    movement: movement.partial().optional(),
    playerControl: empty.optional(),
    combat: combat.partial().optional(),
    work: worker.partial().optional(),
    storage: storage.partial().optional(),
    production: production.partial().optional(),
    campDefense: empty.optional(),
    progression: progression.partial().optional(),
    inventory: inventory.partial().optional(),
    spellcasting: spellcasting.partial().optional(),
    revival: z
      .object({ workTicks: positive, queueCapacity: positive.max(12) })
      .strict()
      .optional(),
  })
  .strict();
const fields = {
  id: idSchema,
  category: idSchema.optional(),
  kind: z.enum(["unit", "building", "item", "resource"]),
  name: z.string().min(1),
  description: z.string(),
  asset: idSchema,
  icon: idSchema,
  hero: z.boolean().optional(),
  level: positive.optional(),
  experienceYield: natural.optional(),
  itemEffect: z
    .discriminatedUnion("type", [
      z
        .object({
          type: z.literal("equipment"),
          damage: natural,
          armor: natural,
          maxHp: natural,
        })
        .strict(),
      z.object({ type: z.literal("consumable"), heal: positive }).strict(),
    ])
    .optional(),
  selectable: z.boolean().optional(),
  selectionClass: z.enum(["army", "worker"]).optional(),
  vision: natural.max(96).optional(),
  body: z
    .object({ maxHp: positive, armor: natural, armorType: idSchema })
    .strict()
    .optional(),
  footprint: z
    .object({ width: positive.max(25), depth: positive.max(25) })
    .strict()
    .optional(),
  entrance: z
    .object({ x: z.number().int(), y: z.number().int() })
    .strict()
    .optional(),
  stackLimit: positive.max(100).optional(),
  yield: positive.optional(),
  gatheringCapacity: positive.max(100).optional(),
  currency: z.boolean().optional(),
  regrowthTicks: positive.optional(),
  constructionClearance: natural.max(32).optional(),
  creation: creationSchema.optional(),
};
export const definitionSchema = z
  .object({ ...fields, behaviors: behaviorSchema })
  .strict();
export const authoredDefinitionSchema = z
  .object({
    ...fields,
    behaviorSets: z.array(idSchema).optional(),
    disabledBehaviors: z
      .array(
        z.enum(
          behaviorNames as [
            (typeof behaviorNames)[number],
            ...(typeof behaviorNames)[number][],
          ],
        ),
      )
      .optional(),
    behaviors: rawBehaviors.optional(),
  })
  .strict();
export const behaviorSetSchema = z
  .object({ id: idSchema, behaviors: rawBehaviors })
  .strict();
export const actionNames = [
  "move",
  "attack",
  "stop",
  "build",
  "produce",
  "cancel",
  "rally",
  "pause",
] as const;
export const actionMetaSchema = z
  .object({
    category: idSchema.optional(),
    name: z.string().min(1),
    description: z.string(),
    icon: idSchema,
    priority: z.number().int(),
    hotkey: z
      .string()
      .regex(/^(?:[A-Z]|Escape)$/)
      .optional(),
  })
  .strict();
export const actionsSchema = z
  .object({
    navigation: z
      .object({ back: actionMetaSchema.omit({ category: true }) })
      .strict(),
    categories: z
      .record(
        idSchema,
        actionMetaSchema.omit({ category: true }).extend({
          parent: idSchema.optional(),
        }),
      )
      .default({}),
    actions: z.record(z.enum(actionNames), actionMetaSchema),
    overrides: z.record(
      z.string(),
      z
        .object({
          category: idSchema.nullable().optional(),
          priority: z.number().int().optional(),
          hotkey: z
            .string()
            .regex(/^(?:[A-Z]|Escape)$/)
            .optional(),
        })
        .strict(),
    ),
  })
  .strict();
export const assetSchema = z
  .object({
    id: idSchema,
    file: z.string().min(1).optional(),
    image: z
      .string()
      .regex(/^assets\/.*\.png$/)
      .optional(),
    carryAsset: idSchema.optional(),
    character: idSchema.optional(),
    scale: z.number().positive().optional(),
    healthHeight: z.number().positive().optional(),
    stackHeight: z.number().positive().optional(),
    stackColumns: positive.optional(),
    projectile: z.enum(["arrow", "thorn"]).optional(),
    sceneryAsset: z.string().optional(),
  })
  .strict();
export const rulesSchema = z
  .object({
    id: z.string(),
    armorTypes: z.record(
      idSchema,
      z.object({ name: z.string().min(1), icon: idSchema }).strict(),
    ),
    maxUnits: positive,
    maxBuildings: positive,
    constructionHpPermille: positive.max(1000),
    repairTicks: positive,
    spells: z.record(idSchema, spellSchema),
    spellVisuals: z.record(idSchema, spellVisualSchema),
    lootPools: z.record(
      idSchema,
      z
        .object({
          rolls: positive.max(16),
          entries: z
            .array(
              z
                .object({
                  item: idSchema.nullable(),
                  weight: positive.max(1000000),
                })
                .strict(),
            )
            .min(1)
            .max(256),
        })
        .strict(),
    ),
    armorCoefficient: z.number().positive().max(1),
    damageTypes: z.record(idSchema, z.object({
      name: z.string().min(1), appliesArmor: z.boolean(),
    }).strict()),
    heroStunDurationPermille: natural.max(1000),
    damageMultipliers: z.record(idSchema, z.record(idSchema, natural)),
    startingSetup: z
      .object({
        id: idSchema,
        fort: idSchema,
        gathering: z
          .array(
            z
              .object({
                item: idSchema,
                workers: positive.max(32),
                radius: positive.max(96),
              })
              .strict(),
          )
          .optional(),
        inventory: stockSchema,
        units: z.array(
          z
            .object({
              definition: idSchema,
              offset: z
                .object({ x: z.number().int(), y: z.number().int() })
                .strict(),
            })
            .strict(),
        ),
      })
      .strict(),
    ai: z
      .object({
        revision: positive,
        decisionTicks: positive.max(400),
        economyTicks: positive.max(2400),
        strategyTicks: positive.max(2400),
        operationTicks: positive.max(400),
        reactionTicks: natural.max(200),
        orderIntervalTicks: positive.max(400),
        workers: z
          .object({
            minimum: positive.max(100),
            target: positive.max(100),
            maximum: positive.max(120),
            reserve: natural.max(12),
          })
          .strict(),
        army: z
          .object({
            minimum: positive.max(160),
            maximum: positive.max(160),
            homeGuard: natural.max(16),
            engagePermille: positive.max(5000),
            campPermille: positive.max(5000),
            retreatHealthPermille: positive.max(900),
            pursuitRadius: positive.max(64),
          })
          .strict(),
        limits: z
          .object({
            commandsPerBeat: positive.max(16),
            placementCandidates: positive.max(64),
            spellCandidates: positive.max(64),
          })
          .strict(),
        composition: z
          .array(
            z
              .object({ definition: idSchema, weight: positive.max(1000) })
              .strict(),
          )
          .min(1)
          .max(16),
        skillPreference: z.array(idSchema).max(16),
      })
      .strict(),
  })
  .strict();
export const placementSchema = z
  .object({
    id: z.string().min(1),
    mapKnowledge: z.enum(["public", "hidden"]).optional(),
    definition: idSchema,
    position: pointSchema,
    rotation: z.number().finite().default(0),
    owner: ownerSchema,
    initialState: z
      .object({
        health: positive.optional(),
        construction: z.literal("complete").optional(),
        amount: natural.optional(),
        inventory: stockSchema.optional(),
        quantity: positive.optional(),
      })
      .strict()
      .optional(),
    appearance: z
      .object({
        asset: idSchema.optional(),
        scale: z.number().positive().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export const campSchema = z
  .object({
    id: z.string().min(1),
    mapKnowledge: z.enum(["public", "hidden"]).optional(),
    members: z.array(z.string()).min(1),
    home: pointSchema,
    aggroRange: positive.max(64),
    leash: positive.max(96),
    aggression: z.enum(["players", "passive"]),
    lootPool: idSchema.optional(),
  })
  .strict();
export type Definition = z.infer<typeof definitionSchema>;
export type Behaviors = z.infer<typeof behaviorSchema>;
export type Creation = z.infer<typeof creationSchema>;
export type Stock = z.infer<typeof stockSchema>;
export type Placement = z.infer<typeof placementSchema>;
export type Camp = z.infer<typeof campSchema>;
export type Rules = z.infer<typeof rulesSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type ActionName = (typeof actionNames)[number];
export const slotOwner = (slot: number): Owner =>
  ownerSchema.parse(`player.${slot + 1}`);
export const ownerSlot = (owner: Owner): number =>
  owner === "none" ? -1 : Number(owner.slice(7)) - 1;
