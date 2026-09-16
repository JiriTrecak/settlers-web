import {z} from 'zod';

/** The overhead forest affects illumination, never navigation or line of sight. */
export const canopySchema=z.object({
 enabled:z.boolean(),
 height:z.number().min(12).max(100),
 scale:z.number().min(16).max(160),
 coverage:z.number().min(.1).max(.95),
 sway:z.number().min(0).max(3),
 speed:z.number().min(0).max(2),
 cloudShadow:z.number().min(0).max(1).optional(),
 seed:z.number().int().min(0).max(2147483647),
}).strict();
export type CanopySettings=z.infer<typeof canopySchema>;
export const DEFAULT_CANOPY:CanopySettings={enabled:false,height:28,scale:64,coverage:.72,sway:1.2,speed:.35,cloudShadow:.3,seed:731};
