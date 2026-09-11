import { z } from "zod";
import { actionSchema } from "../types/types";
import { pipelineSchema } from "./save";
export const LOCAL_SAVE_FORMAT_VERSION=4;
export const saveModeSchema=z.enum(['campaign','skirmish']);
export type SaveMode=z.infer<typeof saveModeSchema>;
const natural = z.number().int().nonnegative();
const savedMatch = z.object({
  v: z.literal(1),
  roomId: z.string(),
  mapId: z.string(),
  mapRevision: z.string(),
  seed: natural,
  delay: z.number().int().positive(),
  checksumEvery: z.number().int().positive(),
  tickMs: z.literal(25),
  slots: z.array(z.object({
    player: natural,
    kind: z.enum(["human", "ai"]),
    name: z.string().optional(),
    team: natural.optional(),
  }).strict()).min(1).max(8),
}).strict().refine(match => new Set(match.slots.map(slot => slot.player)).size === match.slots.length, "Duplicate player slots");
export const localSaveSchema = z
  .object({
    v: z.literal(LOCAL_SAVE_FORMAT_VERSION),
    remote: z.literal(false),
    mode:saveModeSchema,
    player:natural.nullable(),
    match:savedMatch,
    mapId: z.string(),
    mapRevision: z.string(),
    seed: natural,
    world: z.unknown(),
    controlGroups:z.array(z.array(z.number().int().positive()).max(160)).max(10).optional(),
    pipeline: pipelineSchema,
    clients: z.array(
      z
        .object({
          player: natural,
          sentThrough: natural,
          outbox: z.array(actionSchema),
        })
        .strict(),
    ),
  })
  .strict();

export type LocalSave=z.infer<typeof localSaveSchema>;
