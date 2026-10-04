import {z} from 'zod';

/** Viewport preferences are local to the editor, never map or biome overrides. */
export const editorPreviewSchema=z.object({canopy:z.boolean().optional()}).strict();
