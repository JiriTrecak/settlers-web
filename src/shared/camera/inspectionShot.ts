import {z} from 'zod';
const point=z.tuple([z.number().finite(),z.number().finite(),z.number().finite()]);
/** World-space inspection pose; does not move units or alter the editor camera. */
export const inspectionShotSchema=z.object({eye:point,target:point,fov:z.number().min(20).max(90).default(55)}).strict().refine(p=>p.eye.some((v,i)=>Math.abs(v-p.target[i])>.001),'Eye and target must differ');
export type InspectionShot=z.infer<typeof inspectionShotSchema>;
