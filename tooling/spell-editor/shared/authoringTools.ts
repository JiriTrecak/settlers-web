import {z} from 'zod';

/** Transport-neutral tool contract. Eve, MCP and HTTP all execute this catalogue. */
export const authoringTools = {
 studio_schema: {description:'Discover current engine schemas. Request commands for the operation list, an operation name for its input, or spell/effect/encounter/asset for a document schema.',inputSchema:z.object({section:z.string()}).strict()},
 studio_author: {description:'Execute a validated editor command. Pass the complete command as JSON, including op. Uses the same revision checks, simulation, storage and publication as the UI and MCP.',inputSchema:z.object({commandJson:z.string().max(1_000_000)}).strict()},
 studio_canvas: {description:'Inspect the active editor canvas or capture it as an image. Optionally open a saved spell/effect first. Never discards unsaved user changes.',inputSchema:z.object({workspace:z.enum(['current','spells','effects']),id:z.string(),capture:z.boolean()}).strict()},
 studio_image: {description:'Generate an original spell icon or effect texture with GPT Image 2.5. Imports a 512px PNG and its full-resolution source into Asset Studio and publishes it for immediate use. Transparency is real alpha. A new unique asset ID is required; existing assets are never overwritten.',inputSchema:z.object({id:z.string().regex(/^asset\.[a-z0-9.-]+$/),name:z.string().min(1).max(160),kind:z.enum(['icon','texture']),prompt:z.string().min(10).max(12000),transparent:z.boolean()}).strict()},
} as const;
export type AuthoringToolName=keyof typeof authoringTools;
export const toolRequestSchema=z.object({name:z.enum(['studio_schema','studio_author','studio_canvas','studio_image']),input:z.unknown()}).strict();
