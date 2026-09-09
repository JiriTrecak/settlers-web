import { z } from "zod";
import { actionSchema, type Action } from "../../shared/types/types";
import { pointSchema, idSchema } from "../../content/schema";
const n = z.int().nonnegative(),
  id = z.int().positive();
export const missionSchema = z
  .object({
    kind: z.enum(["scout", "camp", "raid", "assault", "defend", "regroup"]),
    key: z.string(),
    point: pointSchema,
    started: n,
    until: n,
    stage: z.enum(["assemble", "travel", "engage", "recover"]),
    progressPoint: pointSchema,
    progressTick: n,
    members: z.array(id).max(160),
  })
  .strict();
export const aiStateSchema = z
  .object({
    version: z.literal(1),
    briefing: z.string(),
    sequence: n,
    nextEconomy: n,
    nextStrategy: n,
    nextOperation: n,
    mission: missionSchema.nullable(),
    guards: z.array(id).max(16),
    scout: id.nullable(),
    nextScout: n,
    camps: z.record(
      z.string(),
      z
        .object({
          status: z.enum(["expected", "active", "empty", "cleared"]),
          seen: n,
          retry: n,
          killed: z.array(id),
          seenIds: z.array(id),
        })
        .strict(),
    ),
    sightings: z
      .array(
        z
          .object({
            id,
            definition: idSchema,
            point: pointSchema,
            hp: n,
            seen: n,
            hostile: z.boolean(),
          })
          .strict(),
      )
      .max(512),
    inspected: z.record(z.string(), n),
    failedSites: z.record(z.string(), n),
    placementCursor: n,
    orders: z.record(
      z.string(),
      z
        .object({ signature: z.string(), tick: n, point: pointSchema, hp: n })
        .strict(),
    ),
    workerReturns: z.record(
      z.string(),
      z.object({ target: id, until: n }).strict(),
    ),
    pending: z
      .array(
        z
          .object({ seq: n, tick: n, action: actionSchema, reason: z.string() })
          .strict(),
      )
      .max(32),
    damage: z.record(
      z.string(),
      z.object({ hp: n, seen: n, reactAt: n }).strict(),
    ),

    plan: z
      .object({
        workers: n,
        army: n,
        heroLevel: n,
        heroXpNeeded: n,
        economy: z.string(),
        reason: z.string(),
      })
      .strict(),
    metrics: z
      .object({
        issued: n,
        accepted: n,
        rejected: n,
        builds: n,
        recruits: n,
        casts: n,
        pickups: n,
        revivals: n,
      })
      .strict(),
    trace: z
      .array(
        z
          .object({
            tick: n,
            reason: z.string(),
            action: z.string(),
            accepted: z.boolean().optional(),
          })
          .strict(),
      )
      .max(80),
  })
  .strict();
export type AIState = z.infer<typeof aiStateSchema>;
export type Mission = z.infer<typeof missionSchema>;
export type AICommand = { seq: number; action: Action };
export type AIReceipt = {
  seq: number;
  tick: number;
  accepted: boolean;
  actors: readonly number[];
};
export function newAIState(briefing: string, seed: number): AIState {
  return {
    version: 1,
    briefing,
    sequence: 0,
    nextEconomy: 0,
    nextStrategy: 0,
    nextOperation: 0,
    mission: null,
    guards: [],
    scout: null,
    nextScout: 0,
    camps: {},
    sightings: [],
    inspected: {},
    failedSites: {},
    placementCursor: (seed >>> 0) % 192,
    orders: {},
    workerReturns: {},
    pending: [],
    damage: {},
    plan: {
      workers: 0,
      army: 0,
      heroLevel: 1,
      heroXpNeeded: 0,
      economy: "Develop income",
      reason: "Establish the colony",
    },
    metrics: {
      issued: 0,
      accepted: 0,
      rejected: 0,
      builds: 0,
      recruits: 0,
      casts: 0,
      pickups: 0,
      revivals: 0,
    },
    trace: [],
  };
}
