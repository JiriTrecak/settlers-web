import {z} from 'zod';

/** The overhead forest affects illumination, never navigation or line of sight. */
export const canopySchema=z.object({
 enabled:z.boolean(),
 height:z.number().min(12).max(256),
 scale:z.number().min(16).max(1024),
 softness:z.number().min(.01).max(.45).default(.14),
 strength:z.number().min(0).max(1).default(.65),
 coverage:z.number().min(.1).max(.95),
 sway:z.number().min(0).max(3),
 speed:z.number().min(0).max(2),
 cloudShadow:z.number().min(0).max(1).optional(),
 seed:z.number().int().min(0).max(2147483647),
}).strict();
export type CanopySettings=z.infer<typeof canopySchema>;
export const DEFAULT_CANOPY:CanopySettings={enabled:false,height:120,scale:300,softness:.14,strength:.65,coverage:.72,sway:1.2,speed:.35,cloudShadow:.3,seed:731};
