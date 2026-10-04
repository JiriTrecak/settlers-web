import {presentationRecipes} from '../../../src/content/effects/library';
import {value} from '../../../src/content/abilities/schema';
import type {PreviewState} from '../shared/view';
import './timeline.css';
type Span={label:string;start:number;end:number;kind:string};
/** Tick-based view of the real preview run. Seeking is owned by the simulation service. */
export class SpellTimeline{
 readonly element=document.createElement('section');
 private tracks=document.createElement('div');
 private cursor=document.createElement('div');
 private range=document.createElement('input');
 private time=document.createElement('output');
 private scale=document.createElement('div');
 private key='';private dragging=false;
 constructor(seek:(tick:number)=>void){
  this.element.className='spell-timeline';this.tracks.className='timeline-tracks';this.cursor.className='timeline-cursor';
  const ruler=document.createElement('div');ruler.className='timeline-ruler';ruler.innerHTML='<span>PLAYHEAD</span>';
  this.range.type='range';this.range.min='0';this.range.step='1';this.range.setAttribute('aria-label','Spell timeline playhead');
  this.range.addEventListener('input',()=>{this.dragging=true;this.showTime(Number(this.range.value));seek(Number(this.range.value));});
  this.range.addEventListener('change',()=>{this.dragging=false;seek(Number(this.range.value));});
  this.range.addEventListener('blur',()=>{this.dragging=false;});
  ruler.append(this.range,this.time);this.scale.className='timeline-scale';this.element.append(ruler,this.scale,this.tracks);
  this.tracks.addEventListener('click',e=>{const b=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-tick]');if(b)seek(Number(b.dataset.tick));});
 }
 private showTime(tick:number){this.time.textContent=`${(tick/40).toFixed(2)}s · ${tick}t`;this.range.setAttribute('aria-valuetext',this.time.textContent);this.cursor.style.left=`${Number(this.range.max)?tick/Number(this.range.max)*100:0}%`;}
 update(s:PreviewState){
  if(this.range.max!==String(s.duration)){this.scale.replaceChildren();for(let i=0;i<=4;i++){const mark=document.createElement('span');mark.textContent=`${(s.duration*i/160).toFixed(1)}s`;this.scale.append(mark);}}
  this.range.max=String(s.duration);this.range.disabled=!s.active;
  if(!this.dragging){this.range.value=String(s.tick);this.showTime(s.tick);}
  const key=JSON.stringify([s.epoch,s.active,s.duration,s.timelineEvents]);for(const b of this.tracks.querySelectorAll<HTMLElement>('[data-end]')){b.classList.toggle('is-current',s.tick>=Number(b.dataset.tick)&&s.tick<Number(b.dataset.end));b.classList.toggle('is-future',s.tick<Number(b.dataset.tick));}if(key===this.key)return;this.key=key;
  const a=s.document.definition,p=s.document.presentation,r=a.ranks[s.rank-1],events=s.timelineEvents;
  const release=events.find(e=>e.event==='released')?.tick??a.cast.prepareTicks;
  const channel=a.cast.channel?value(a.cast.channel.waves,r)*value(a.cast.channel.intervalTicks,r):0;
  const interrupted=events.find(e=>e.event==='cancelled')?.tick;
  const end=events.find(e=>e.event==='finished')?.tick??release+channel+a.cast.recoverTicks;
  const cast:Span[]=a.weaponCast?events.filter(e=>e.event==='weaponOrdered').map(e=>({label:'Weapon approach / windup',start:e.tick,end:events.find(o=>o.cast===e.cast&&(o.event==='released'||o.event==='weaponOrderCancelled'))?.tick??s.duration,kind:'prepare'})):a.activation==='passive'?[{label:a.aura?'Aura active':a.triggers?.some(t=>t.event==='interval')?'Periodic passive':'Combat passive',start:0,end:s.duration,kind:'status'}]:[
   ...(release>a.cast.prepareTicks?[{label:'Turn',start:0,end:release-a.cast.prepareTicks,kind:'prepare'}]:[]),
   {label:`Prepare · ${p.animations.prepare}`,start:Math.max(0,release-a.cast.prepareTicks),end:release,kind:'prepare'},
   ...(channel?[{label:`Channel · ${p.animations.channel??p.animations.prepare}`,start:release,end:release+channel,kind:'channel'}]:[]),
   {label:`Recover · ${p.animations.recover}`,start:release+channel,end,kind:'recover'},
  ];
  if(interrupted!==undefined)for(const span of cast)span.end=Math.min(span.end,interrupted);
  const persistent:Span[]=a.persistent?[{label:a.persistent.toggle?'Toggle active':'Persistent effect',start:release,end:Math.min(release+value(a.persistent.durationTicks,r),events.find(e=>e.event==='finished'&&e.reason)?.tick??Infinity),kind:'channel'}]:[];
  const impacts:Span[]=events.filter(e=>['splitEnded','returned','interval','projectile','impact','wave','healed','damaged','drained','manaRestored','teleported','criticalStrike','evaded','cleaved','weaponEnhanced','enhancedHit','weaponRelease','weaponOrdered','weaponOrderCancelled','death','kill','resurrected','converted','contained','releasedContained','digested','sacrificed','revived','revivalCancelled','cancelled','released'].includes(e.event)).map(e=>({label:`${e.event}${e.amount!==undefined?' · '+e.amount:''}`,start:e.tick,end:Math.min(e.endedTick??Infinity,e.tick+(e.event==='projectile'?(e.durationTicks??1):1)),kind:e.event==='cancelled'?'cancelled':'impact'}));
  const vision:Span[]=events.filter(e=>e.event==='visionCreated'&&(e.durationTicks??0)>0).map(e=>({label:`Vision · radius ${e.radius}`,start:e.tick,end:e.tick+e.durationTicks!,kind:'status'}));
  const returns:Span[]=events.filter(e=>e.event==='revivalStarted').map(e=>({label:`Returning hero · ${e.target}`,start:e.tick,end:events.find(o=>o.cast===e.cast&&(o.event==='revived'||o.event==='revivalCancelled'))?.tick??Math.min(s.duration,e.tick+(e.durationTicks??1)),kind:'status'}));
  const held:Span[]=events.filter(e=>e.event==='contained').map(e=>({label:`Contained · ${e.target}`,start:e.tick,end:Math.min(s.duration,e.endedTick??Infinity,events.find(o=>o.cast===e.cast&&o.target===e.target&&o.event==='releasedContained')?.tick??Infinity,e.tick+(e.durationTicks??1)),kind:'status'}));
  const statuses:Span[]=events.filter(e=>e.event==='splitStarted'||e.event==='statusApplied'||e.event==='summoned'||e.event==='resurrected'&&e.durationTicks!==undefined).map(e=>{
   const dispel=e.event==='statusApplied'?events.find(l=>l.event==='dispelled'&&l.target===e.target&&l.tick>=e.tick):undefined;
   const duration=e.durationTicks??Math.max(1,...a.onRelease.flatMap(op=>op.op==='branch'?[...op.then,...op.else]:[op]).map(op=>op.op==='summon'?(op.durationTicks===undefined?s.duration:value(op.durationTicks,r)):0));
   return {label:e.event==='splitStarted'?`Linked form · ${e.spawned?.length??0} bodies`:e.event==='summoned'?`${e.amount} summons${e.untilDeath?' · no timer':''}`:e.event==='resurrected'?`Reanimated · target ${e.target}`:`Status · target ${e.target}${e.untilDeath?' · until death':''}`,start:e.tick,end:Math.min(s.duration,e.endedTick??Infinity,dispel?.tick??Infinity,e.tick+duration),kind:'status'};
  });
  const visuals:Span[]=events.flatMap(e=>presentationRecipes(p,s.effects).filter(c=>c.event===e.event&&(!c.statusId||c.statusId===e.statusId)).map(c=>{
   const duration=c.durationFrom?e.durationTicks??c.durationTicks:c.durationTicks;
   const start=e.tick+c.startTick+(c.shape==='rain'&&c.durationFrom?duration-duration/(c.fallSpeed??1):0);
   return {label:c.id,start,end:e.event==='projectile'&&['missile','wavefront'].includes(c.shape)?Math.min(e.endedTick??Infinity,start+duration):c.lifetime==='status'?Math.min(s.duration,e.endedTick??Infinity,events.find(l=>l.event==='dispelled'&&l.target===e.target&&l.tick>=e.tick)?.tick??Infinity,e.tick+(e.durationTicks??s.duration)):start+(c.shape==='rain'?duration/(c.fallSpeed??1)+(c.launchDelayMs??0)/25+(c.impact?.durationTicks??0):duration)+(c.emitter?.lifetimeTicks??0),kind:'visual'};
  }));
  if(a.aura){
   statuses.push({label:'Aura recipients',start:1,end:s.duration,kind:'status'});
   for(const cue of presentationRecipes(p,s.effects).filter(c=>c.event==='statusApplied'))visuals.push({label:cue.id+' · persistent',start:1,end:s.duration,kind:'visual'});
  }
  this.tracks.replaceChildren();
  for(const [name,spans]of [['Animation',cast],...(persistent.length?[['Persistence',persistent] as [string,Span[]]]:[]),...(vision.length?[['Vision',vision] as [string,Span[]]]:[]),['Impacts',impacts],['Statuses',[...statuses,...returns,...held]],...Array.from(new Set(visuals.map(v=>v.label)),name=>[name,visuals.filter(v=>v.label===name)] as [string,Span[]])] as [string,Span[]][]){
   const row=document.createElement('div');row.className='timeline-row';const label=document.createElement('span');label.className='timeline-label';label.textContent=name;
   const lane=document.createElement('div');lane.className='timeline-lane';
   if(s.active)for(const span of spans){if(span.end<=span.start)continue;const b=document.createElement('button');b.type='button';b.className='timeline-span '+span.kind;b.textContent=span.label;b.dataset.tick=String(span.start);b.dataset.end=String(span.end);b.classList.toggle('is-current',s.tick>=span.start&&s.tick<span.end);b.classList.toggle('is-future',s.tick<span.start);b.title=`${span.label} · ${(span.start/40).toFixed(2)}–${(span.end/40).toFixed(2)}s`;b.setAttribute('aria-label',b.title);
    b.style.left=`${span.start/s.duration*100}%`;b.style.width=`${Math.max(.35,Math.min(s.duration-span.start,span.end-span.start)/s.duration*100)}%`;lane.append(b);}
   row.append(label,lane);this.tracks.append(row);
  }
  const overlay=document.createElement('div');overlay.className='timeline-overlay';overlay.append(this.cursor);this.tracks.append(overlay);
  if(!s.active){const hint=document.createElement('span');hint.className='timeline-empty';hint.textContent=s.targeting?'Choose a target in the scene to fire. Escape cancels.':'Cast to start a fresh take. Drag the playhead to inspect any frame.';this.tracks.append(hint);}
 }
}
