import type {GameContext} from '../game/context';
import {alive} from '../game/state';
import {precise,fixed} from '../game/motion';
import {heading} from '../game/facing';
import {spellControl} from './statuses';
import {itemFlag} from '../game/itemModifiers';
import {isStunned} from '../game/effects';
import {locomotion} from '../game/locomotion';
export function charging(c:GameContext,id:number){return c.state.spellDeliveries.some(d=>d.source===id&&c.registry.findAbility(d.ability)?.delivery?.kind==='charge');}
export function chargeStep(c:GameContext,source:number,target:number,speed:number):'moving'|'arrived'|'blocked'{
 const a=c.get(source),b=c.get(target);
 if(!a?.unit||!b?.unit||!alive(a)||!alive(b)||a.unit.contained||a.unit.garrison||a.unit.release||b.unit.contained||b.unit.garrison||b.unit.release||locomotion(c.def(a))!=='ground'||locomotion(c.def(b))!=='ground'||itemFlag(a,c.registry,'rooted')||isStunned(a,c.registry)||spellControl(a,c.registry,'silence'))return 'blocked';
 if(c.spatial.bodyRange(a,b)<=.65**2)return 'arrived';
 const from=precise(a),to=precise(b),dx=to.x-from.x,dy=to.y-from.y,n=Math.hypot(dx,dy);
 const step=Math.min(speed/40,Math.max(0,Math.sqrt(c.spatial.bodyRange(a,b))-.3));
 const next={x:Math.round((from.x+dx/n*step)*1000)/1000,y:Math.round((from.y+dy/n*step)*1000)/1000,...(from.surface?{surface:from.surface}:{})};
 if(!step||!c.spatial.clearSegment(fixed(from),fixed(next),new Map(),a)||!c.spatial.unitSegmentClear(fixed(from),fixed(next),a.id))return 'blocked';
 a.rotation=heading(a,to);a.unit.position=fixed(next);a.x=Math.floor(next.x);a.y=Math.floor(next.y);a.unit.lastMovedTick=c.state.tick;
 c.spatial.updateUnitMovement(a);c.motionRevision++;c.observationRevision++;
 return c.spatial.bodyRange(a,b)<=.65**2?'arrived':'moving';
}
