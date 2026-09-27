import type {UtcMap} from '../../src/shared/map/utcmap';
/** Accessible expansion resources outside both flat starting construction cores. */
export const THREEWATER_ROOT_SITES=[{x:118,y:193},{x:143,y:91}] as const;
export function addThreewaterRoots(map:UtcMap){
 const entities=map.entities.filter(e=>!e.id.startsWith('root.'));
 for(const [i,position]of THREEWATER_ROOT_SITES.entries())entities.push({id:`root.${i}`,definition:'building.neutral.corrupted-root',owner:'none',position:{...position},rotation:i*180});
 return entities;
}
