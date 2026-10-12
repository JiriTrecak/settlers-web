import type {Game} from '../game/game';
import {alive,type Entity} from '../game/state';
import {discardNavigation,releaseCombat} from '../game/combatIntent';
import {controlImmune} from './controlPolicy';

/** Forced combat temporarily owns navigation, never the player's saved orders. */
export function reconcileTaunt(game:Game,e:Entity){
 const u=e.unit;if(!u)return;
 const c=game.context;
 const source=alive(e)&&!u.contained&&!u.garrison&&!u.release&&c.def(e).behaviors.combat&&!controlImmune(e,c.registry,'taunt')
  ? e.spellStatuses?.filter(s=>s.expires>c.state.tick&&!s.blockedControls?.includes('taunt')&&c.registry.findStatus(s.ability,s.status)?.taunt)
   .sort((a,b)=>b.started-a.started||b.cast-a.cast||a.source-b.source)
   .map(s=>{const actor=c.get(s.source);return actor&&alive(actor)&&actor.owner===s.owner&&!actor.unit?.contained&&!actor.unit?.garrison&&!actor.unit?.release&&game.combat.hostile(e,actor)?actor:undefined;})
   .find(Boolean):undefined;
 if(u.taunt?.source===source?.id)return;
 const resumeGoal=u.taunt?.resumeGoal??(u.job!==null?(u.goal??c.spatial.cell(e)):null);
 discardNavigation(u);releaseCombat(u);u.idle=null;u.retryAt=c.state.tick;
 if(source){
  u.taunt={source:source.id,resumeGoal};
  game.abilities.cancel(e.id,'Taunted');
 }else{
  delete u.taunt;
  if(u.job!==null&&resumeGoal!==null&&c.spatial.validNode(resumeGoal))u.goal=resumeGoal;
 }
}

export function reconcileTaunts(game:Game){
 for(const e of game.context.entitySnapshot())if(e.unit&&(e.unit.taunt||e.spellStatuses?.length))reconcileTaunt(game,e);
}
