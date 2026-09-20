import {z} from 'zod';
import {assetDefinitionSchema,FILE_ROLES} from './asset';
import {authoringId} from './recipes';
/** UI and MCP dispatch this same contract. Mutations use optimistic revisions. */
export const assetCommandSchema=z.discriminatedUnion('op',[
 z.object({op:z.literal('asset.list')}).strict(),
 z.object({op:z.literal('asset.publication'),id:authoringId}).strict(),
 z.object({op:z.literal('asset.get'),id:authoringId}).strict(),
 z.object({op:z.literal('asset.create'),definition:assetDefinitionSchema}).strict(),
 z.object({op:z.literal('asset.save'),definition:assetDefinitionSchema,expectedRevision:z.number().int().positive()}).strict(),
 z.object({op:z.literal('asset.upload'),id:authoringId,expectedRevision:z.number().int().positive(),role:z.enum(FILE_ROLES),index:z.number().int().min(1).max(1024),format:z.string().min(1).max(12),base64:z.string().min(1).max(72*1024*1024)}).strict(),
 z.object({op:z.literal('asset.publish'),id:authoringId,expectedRevision:z.number().int().positive()}).strict(),
 z.object({op:z.literal('asset.archive'),id:authoringId,expectedRevision:z.number().int().positive()}).strict(),
 z.object({op:z.literal('asset.validate'),id:authoringId}).strict(),
]);
export type AssetCommand=z.infer<typeof assetCommandSchema>;
