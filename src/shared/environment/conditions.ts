import {z} from 'zod';
/** The only environment values a map may own. Appearance comes from its biome. */
export const environmentConditionsSchema=z.object({
 hour:z.number().finite().min(0).max(24),playing:z.boolean(),
 weather:z.object({kind:z.enum(['clear','rain','snow','spores'])}).optional(),
});
export type EnvironmentConditions=z.infer<typeof environmentConditionsSchema>;
export function environmentConditions(raw:unknown):EnvironmentConditions{return environmentConditionsSchema.parse(raw);}
