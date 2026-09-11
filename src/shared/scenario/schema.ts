import {z} from 'zod';
export const regionSchema=z.object({id:z.string().regex(/^[a-zA-Z][\w.-]*$/),x:z.number().int().min(0).max(511),y:z.number().int().min(0).max(511),radius:z.number().positive().max(64)}).strict();
export const objectiveDefinitionSchema=z.object({id:z.string().regex(/^[a-zA-Z][\w.-]*$/),title:z.string().min(1).max(120),description:z.string().min(1).max(500),optional:z.boolean().default(false)}).strict();
export const missionSchema=z.object({
  campaign:z.string().min(1).max(80), title:z.string().min(1).max(120), order:z.number().int().min(1).max(100),
  objectives:z.array(objectiveDefinitionSchema).max(64).optional(),
  heroLevelCap:z.number().int().min(1).max(10).optional(),
  script:z.string().min(1).max(64000), regions:z.array(regionSchema).max(128),
}).strict().refine(m=>new Set(m.regions.map(r=>r.id)).size===m.regions.length,'Region IDs must be unique').refine(m=>new Set(m.objectives?.map(o=>o.id)).size===(m.objectives?.length??0),'Objective IDs must be unique');
export type MissionDefinition=z.infer<typeof missionSchema>;
export const missionStateSchema=z.object({
  started:z.boolean(), pausedTicks:z.number().int().nonnegative().default(0), variables:z.record(z.string(),z.union([z.string().max(2000),z.number().finite(),z.boolean()])),
  spawned:z.array(z.string()), objectiveStates:z.record(z.string(),z.enum(['active','completed','failed'])).default({}), objective:z.string().max(500),
  dialogue:z.object({id:z.number().int().nonnegative(),speaker:z.string().max(80),portrait:z.string().max(120),text:z.string().max(2000),cinematic:z.boolean().default(false),remaining:z.number().int().nonnegative().default(0),until:z.number().int().nonnegative()}).strict().nullable(),
  scene:z.object({x:z.number().finite(),y:z.number().finite()}).strict().nullable().default(null),
  facing:z.array(z.object({id:z.string(),x:z.number().finite(),y:z.number().finite()}).strict()).max(32).default([]),
  nextDialogue:z.number().int().positive(), error:z.string().nullable(),
}).strict();
export type MissionState=z.infer<typeof missionStateSchema>;
export const emptyMissionState=():MissionState=>({started:false,pausedTicks:0,variables:{},spawned:[],objectiveStates:{},objective:'',dialogue:null,scene:null,facing:[],nextDialogue:1,error:null});
