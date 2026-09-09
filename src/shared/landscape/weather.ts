import {z} from 'zod';
export const weatherSchema=z.object({kind:z.enum(['clear','rain','snow']),intensity:z.number().min(0).max(1),windX:z.number().min(-10).max(10),windZ:z.number().min(-10).max(10)}).strict();
export type WeatherSettings=z.infer<typeof weatherSchema>;
export const CLEAR_WEATHER:WeatherSettings={kind:'clear',intensity:0,windX:0,windZ:0};
