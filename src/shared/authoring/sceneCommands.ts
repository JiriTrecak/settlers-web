import {z} from 'zod';
import {authoringId} from './recipes';
import {proceduralLayerSchema,authoredObjectSchema} from './layers';
export const sceneCommandSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('get')}).strict(),z.object({action:z.literal('recipes')}).strict(),
 z.object({action:z.literal('put-layer'),layer:proceduralLayerSchema}).strict(),
 z.object({action:z.literal('put-object'),object:authoredObjectSchema}).strict(),
 z.object({action:z.literal('select'),kind:z.enum(['layer','object']),id:authoringId}).strict(),
 z.object({action:z.literal('remove'),kind:z.enum(['layer','object']),id:authoringId}).strict(),
 z.object({action:z.literal('lock'),kind:z.enum(['layer','object']),id:authoringId,locked:z.boolean()}).strict(),
 z.object({action:z.literal('bake'),id:authoringId}).strict(),
 z.object({action:z.literal('undo')}).strict(),z.object({action:z.literal('redo')}).strict(),
 z.object({action:z.literal('camera'),mode:z.enum(['top','free','game'])}).strict(),
]);
