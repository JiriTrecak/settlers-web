import type {Definition} from '../content/schema';
import type {EntityView} from '../sim/game/observation';
/** Private progression is absent for opponents; never infer their exact experience. */
export function experienceMeter(entity:EntityView,definition:Definition){
 const thresholds=definition.behaviors.progression?.levels.map(l => l.experience);
 if(!thresholds||!entity.progression)return null;
 const level=Math.min(thresholds.length,Math.max(1,entity.stats?.level??1));
 const experience=entity.progression.experience,base=thresholds[level-1],next=thresholds[level];
 if(next===undefined)return {fraction:1,label:`Maximum level ${level}`,description:`${experience} experience. Maximum level reached.`};
 const earned=Math.max(0,experience-base),required=next-base;
 return {fraction:Math.min(1,earned/required),label:`Experience: ${earned} / ${required}`,description:`${experience} total experience. ${Math.max(0,next-experience)} more to reach level ${level+1}.`};
}
