import {z} from 'zod';
import {idSchema, ownerSchema,surfaceSchema} from '../../content/schema';
const point=z.object({elevation:z.number().nonnegative().max(32).optional(),surface:surfaceSchema.optional(),x:z.number().finite().nonnegative(),y:z.number().finite().nonnegative()}).strict();
export const missileSchema=z.object({
 id:z.number().int().positive(),source:z.number().int().positive(),target:z.number().int().positive(),
 definition:idSchema,owner:ownerSchema,origin:point,destination:point,
 launched:z.number().int().nonnegative(),impact:z.number().int().nonnegative(),
 damage:z.number().int().positive(),damageType:idSchema,viewers:z.array(ownerSchema),resolved:z.boolean(),
}).strict();
