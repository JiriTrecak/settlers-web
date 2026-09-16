import {z} from 'zod';
import {surfaceSchema} from '../../content/schema';

/** Continuous simulation coordinates; authored map cells and commands stay integral. */
export const worldPointSchema=z.object({
  surface:surfaceSchema.optional(),
  x:z.number().finite().nonnegative().max(511),
  y:z.number().finite().nonnegative().max(511),
}).strict();
