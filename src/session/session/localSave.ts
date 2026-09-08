import { z } from "zod";
import { actionSchema } from "../../shared/types/types";
import { pipelineSchema, SAVE_FORMAT_VERSION } from "../../shared/save/save";
const natural = z.number().int().nonnegative();
export const localSaveSchema = z
  .object({
    v: z.literal(SAVE_FORMAT_VERSION),
    remote: z.literal(false),
    mapId: z.string(),
    mapRevision: z.string(),
    seed: natural,
    world: z.unknown(),
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
