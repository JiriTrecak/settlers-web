import {z} from 'zod';

export const editorPerformanceSchema=z.object({
 action:z.enum(['get','reset','capture','census','trace','benchmark']).default('get'),
 enabled:z.boolean().optional(),
 width:z.number().int().min(256).max(2560).optional(),
 height:z.number().int().min(256).max(1440).optional(),
 frames:z.number().int().min(1).max(120).optional(),
}).strict();
