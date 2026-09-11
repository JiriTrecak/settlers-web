import type {Game} from '../../src/sim/game/game';
import type {Entity} from '../../src/sim/game/state';
import {precise} from '../../src/sim/game/motion';

type Episode={actor:number;name:string;leader:number;started:number;until:number;pocket:{x:number;y:number};origin:{x:number;y:number};leaderOrigin:{x:number;y:number}|null;reached?:number;ended?:number;reason?:string;leaderDisplacement?:number};
/** Read-only tick sampling; ending reasons are observations, not hidden native events. */
export class TrafficRecoveryTrace {
 readonly episodes:Episode[]=[];
 private active=new Map<number,Episode>();
 private previous=new Map<number,{x:number;y:number}>();
 private origins=new Map<number,{x:number;y:number}>();
 readonly motion=new Map<number,{name:string;travel:number;stationary:number;longestStop:number;currentStop:number}>();
 constructor(private game:Game,private actors:readonly Entity[]){}
 sample(){
  const g=this.game,tick=g.state.tick;
  for(const e of this.actors){
   const p=precise(e),old=this.previous.get(e.id),distance=old?Math.hypot(p.x-old.x,p.y-old.y):0;
   this.previous.set(e.id,{x:p.x,y:p.y});
   if(!old)this.origins.set(e.id,{x:p.x,y:p.y});
   const motion=this.motion.get(e.id)??{name:e.placement??String(e.id),travel:0,stationary:0,longestStop:0,currentStop:0};
   motion.travel+=distance;
   if(old&&e.unit!.order&&distance<.0001){motion.stationary++;motion.currentStop++;motion.longestStop=Math.max(motion.longestStop,motion.currentStop);}else motion.currentStop=0;
   this.motion.set(e.id,motion);
   const detour=e.unit!.detour,yielding=detour?.yielding;let episode=this.active.get(e.id);
   if(episode&&(!yielding||episode.until!==yielding.until||episode.leader!==yielding.leader)){
    const leader=g.context.get(episode.leader),q=leader?precise(leader):null;
    episode.ended=tick;
    episode.leaderDisplacement=q&&episode.leaderOrigin?Math.hypot(q.x-episode.leaderOrigin.x,q.y-episode.leaderOrigin.y):undefined;
    episode.reason=episode.reached===undefined?'ended-before-pocket':tick>=episode.until?'deadline':!leader?.unit?.order?'leader-finished':leader&&g.spatial.range(e,leader)>=25?'leader-cleared':'other';
    this.active.delete(e.id);episode=undefined;
   }
   if(yielding&&!episode){
    const leader=g.context.get(yielding.leader),q=leader?precise(leader):null;
    episode={actor:e.id,name:e.placement??String(e.id),leader:yielding.leader,started:tick,until:yielding.until,pocket:g.spatial.point(detour!.waypoint),origin:{x:p.x,y:p.y},leaderOrigin:q?{x:q.x,y:q.y}:null};
    this.episodes.push(episode);this.active.set(e.id,episode);
   }
   if(episode&&episode.reached===undefined&&p.x===episode.pocket.x&&p.y===episode.pocket.y)episode.reached=tick;
  }
 }
 report(){return {episodes:this.episodes,motion:[...this.motion].map(([id,m])=>{const a=this.origins.get(id)!,b=this.previous.get(id)!,displacement=Math.hypot(b.x-a.x,b.y-a.y);return {...m,travel:Math.round(m.travel*100)/100,displacement:Math.round(displacement*100)/100}}),summary:this.episodes.reduce<Record<string,number>>((s,e)=>{const reason=e.reason??'ongoing';s[reason]=(s[reason]??0)+1;return s;},{})};}
}
