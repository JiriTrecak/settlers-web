import {z} from 'zod';
import {idSchema,ownerSchema} from '../../content/schema';
import {worldPointSchema as position} from './coordinates';
export const shellSchema=z.object({
 id:z.number().int().positive(),source:z.number().int().positive(),definition:idSchema,owner:ownerSchema,
 origin:position,target:position,launched:z.number().int().nonnegative(),impact:z.number().int().nonnegative(),
 damage:z.number().positive(),damageType:idSchema,radius:z.number().positive().max(12),
 slowPermille:z.number().int().nonnegative().max(800),slowTicks:z.number().int().positive().max(1200),
 victims:z.array(ownerSchema),viewers:z.array(ownerSchema),resolved:z.boolean(),
}).strict();
export type Shell=z.infer<typeof shellSchema>;
