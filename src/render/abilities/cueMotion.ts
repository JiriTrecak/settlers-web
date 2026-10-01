import type {AbilityPresentation} from '../../content/abilities/schema';

type Motion=NonNullable<AbilityPresentation['cues'][number]['motion']>;
type Pulse=NonNullable<Motion['scale']>;
const cycle=(tick:number,period:number,phase=0)=>((tick/period+phase)%1+1)%1;
function bounce(t:number):number{
 if(t<1/2.75)return 7.5625*t*t;
 if(t<2/2.75)return 7.5625*(t-=1.5/2.75)*t+.75;
 if(t<2.5/2.75)return 7.5625*(t-=2.25/2.75)*t+.9375;
 return 7.5625*(t-=2.625/2.75)*t+.984375;
}
function pulse(p:Pulse|undefined,tick:number){
 if(!p)return 1;
 const phase=cycle(tick,p.periodTicks,p.phase),triangle=1-Math.abs(phase*2-1);
 const eased=p.easing==='sine'?(1-Math.cos(phase*Math.PI*2))/2:p.easing==='bounce'?bounce(triangle):triangle*triangle*(3-2*triangle);
 return p.min+(p.max-p.min)*eased;
}
/** Absolute tick sampling keeps preview seeks, restores, and frame rates identical. */
export function sampleCueMotion(motion:Motion|undefined,tick:number){
 const r=motion?.rotation;
 return {rotation:r?((r.phaseDegrees??0)*Math.PI/180+cycle(tick,r.periodTicks)*Math.PI*2*(r.direction==='clockwise'?-1:1)):0,
  scale:pulse(motion?.scale,tick),opacity:pulse(motion?.opacity,tick)};
}
