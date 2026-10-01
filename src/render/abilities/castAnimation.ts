import type {AbilityPresentation} from '../../content/abilities/schema';
/** Shared, tick-addressable cast pose. No animation callback releases gameplay effects. */
export function castAnimation(presentation:AbilityPresentation,timeline:{startTick:number;releaseTick:number;finishTick:number;channel?:{endTick:number}},tick:number,has:(clip:string)=>boolean,contact=.55){
 const clips=presentation.animations;
 const channeling=!!timeline.channel&&tick>=timeline.releaseTick&&tick<timeline.channel.endTick;
 if(channeling){const desired=clips.channel??clips.prepare;return {clip:has(desired)?desired:has(clips.fallback)?clips.fallback:'idle',phase:((tick-timeline.releaseTick)%80)/80};}
 const recovery=tick>=(timeline.channel?.endTick??timeline.releaseTick);
 const recoveryStart=timeline.channel?.endTick??timeline.releaseTick;
 const desired=tick<timeline.releaseTick?clips.prepare:tick<timeline.releaseTick+1?clips.release:clips.recover;
 const clip=has(desired)?desired:has(clips.fallback)?clips.fallback:'idle';
 const continuous=clips.prepare===clips.release&&clips.release===clips.recover;
 const progress=recovery?(tick-recoveryStart)/Math.max(1,timeline.finishTick-recoveryStart):(tick-timeline.startTick)/Math.max(1,timeline.releaseTick-timeline.startTick);
 const phase=continuous?(recovery?contact+(1-contact)*progress:contact*progress):progress;
 return {clip,phase:Math.min(.999999,Math.max(0,phase))};
}
