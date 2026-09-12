import {z} from 'zod';
import source from '../../../art/profiles/images.json';
const profile=z.object({format:z.literal('png'),width:z.number().int().positive().optional(),height:z.number().int().positive().optional(),warningBytes:z.number().int().positive(),alpha:z.enum(['optional','opening-and-exterior']),upscale:z.literal(false),kernel:z.literal('lanczos3'),colorSpace:z.literal('srgb')}).strict();
export const imageProfiles=z.object({version:z.literal(1),profiles:z.object({icon:profile,'interface-rim':profile,'interface-fill':profile,'interface-image':profile}).strict()}).strict().parse(source).profiles;
