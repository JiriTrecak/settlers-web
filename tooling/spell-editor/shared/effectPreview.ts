import {z} from 'zod';
import {BIOMES} from '../../../src/content/biomes';
const biomeIdSchema=z.enum(BIOMES.map(b=>b.id) as [string,...string[]]);
export const effectPreviewSettingsSchema=z.object({biome:biomeIdSchema.default('vibrant-forest'),distance:z.number().min(0).max(30).default(6),seed:z.number().int().min(1).max(1_000_000).default(1),sustain:z.boolean().default(false)}).strict();
