import {z} from 'zod';
import {idSchema} from '../../content/schema';
import {itemRuntimeSchema} from '../../content/items';
/** Chapter-start state, shared by every peer and retained for restart/save. */
export const companyMemberSchema=z.object({
 tag:z.string().min(1).max(120),definition:idSchema,
 experience:z.number().int().nonnegative().optional(),
 learned:z.record(idSchema,z.number().int().min(1).max(3)).optional(),
 equipment:z.array(idSchema.nullable()).max(12).optional(),
 equipmentState:z.array(itemRuntimeSchema.nullable()).max(12).optional(),
}).strict();
export const campaignCompanySchema=z.array(companyMemberSchema).min(1).max(32)
 .refine(m=>new Set(m.map(e=>e.tag)).size===m.length,'Duplicate company member');
export type CampaignCompany=z.infer<typeof campaignCompanySchema>;
