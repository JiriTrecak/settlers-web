import {z} from 'zod';
import {ownerSchema,pointSchema,idSchema} from '../../content/schema';
export const visualCueSchema=z.object({
 id:z.number().int().positive(),tick:z.number().int().nonnegative(),
 ability:idSchema,rank:z.number().int().positive().max(3),phase:z.enum(['cast','impact']),
 origin:pointSchema,target:pointSchema,durationTicks:z.number().int().positive(),
 viewers:z.array(ownerSchema),
}).strict();
export type VisualCue=z.infer<typeof visualCueSchema>;
