import type {AbilityPresentation} from '../../../src/content/abilities/schema';
type Cue=AbilityPresentation['cues'][number];

/** Shared transform controls for any authored effect layer. */
export function cueLayerControls(cue:Cue){
 const element=document.createElement('details');element.className='layer-motion';
 const summary=document.createElement('summary');summary.textContent='Layer animation';element.append(summary);
 const label=(name:string,field:HTMLElement)=>{const l=document.createElement('label');l.append(name,field);element.append(l);return field;};
 const select=(name:string,values:string[],value:string)=>{const f=document.createElement('select');for(const v of values){const o=document.createElement('option');o.value=v;o.textContent=v;f.append(o);}f.value=value;label(name,f);return f;};
 const number=(name:string,value:number,min:number,max:number,step=.05)=>{const f=document.createElement('input');f.type='number';f.value=String(value);f.min=String(min);f.max=String(max);f.step=String(step);label(name,f);return f;};
 const check=(name:string,value:boolean)=>{const f=document.createElement('input');f.type='checkbox';f.checked=value;label(name,f);return f;};
 const lifetime=cue.event==='statusApplied'&&cue.anchor==='target'?select('Lifetime',['finite','status'],cue.lifetime??'finite'):undefined;
 const orientation=cue.shape==='billboard'?select('Orientation',['camera','ground'],cue.orientation??'camera'):undefined;
 const follow=check('Follow unit',cue.follow??false);
 const blend=select('Blend',['additive','normal'],cue.blend??'additive');
 const rotate=check('Rotate',!!cue.motion?.rotation);
 const period=number('Rotation period (seconds)',(cue.motion?.rotation?.periodTicks??320)/40,.025,60,.025);
 const direction=select('Direction',['clockwise','counterclockwise'],cue.motion?.rotation?.direction??'clockwise');
 const angle=number('Starting angle (degrees)',cue.motion?.rotation?.phaseDegrees??0,-360,360,1);
 const pulses=(['scale','opacity'] as const).map(key=>{
  const p=cue.motion?.[key];
  return {key,enabled:check(key==='scale'?'Pulse scale':'Pulse opacity',!!p),period:number(`${key} period (seconds)`,(p?.periodTicks??80)/40,.025,60,.025),
   min:number(`${key} minimum`,p?.min??.8,0,key==='opacity'?1:4),max:number(`${key} maximum`,p?.max??1,0,key==='opacity'?1:4),
   easing:select(`${key} easing`,['sine','smoothstep','bounce'],p?.easing??'sine'),phase:number(`${key} phase`,p?.phase??0,0,1)};
 });
 const sync=()=>{for(const f of [period,direction,angle])f.disabled=!rotate.checked;for(const p of pulses)for(const f of [p.period,p.min,p.max,p.easing,p.phase])f.disabled=!p.enabled.checked;};
 element.addEventListener('change',sync);sync();
 return {element,apply(){
  if(lifetime)cue.lifetime=lifetime.value as Cue['lifetime'];
  if(orientation)cue.orientation=orientation.value as Cue['orientation'];
  cue.follow=follow.checked;cue.blend=blend.value as Cue['blend'];
  const motion:NonNullable<Cue['motion']>={};
  if(rotate.checked)motion.rotation={periodTicks:Math.round(Number(period.value)*40),direction:direction.value as 'clockwise'|'counterclockwise',phaseDegrees:Number(angle.value)};
  for(const p of pulses)if(p.enabled.checked)motion[p.key]={periodTicks:Math.round(Number(p.period.value)*40),min:Number(p.min.value),max:Number(p.max.value),easing:p.easing.value as 'sine'|'smoothstep'|'bounce',phase:Number(p.phase.value)};
  if(Object.keys(motion).length)cue.motion=motion;else delete cue.motion;
 }};
}
