import {z} from 'zod';

/** Continuous simulation coordinates; authored map cells and commands stay integral. */
export const worldPointSchema=z.object({
  x:z.number().finite().nonnegative().max(511),
  y:z.number().finite().nonnegative().max(511),
}).strict();
