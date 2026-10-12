import {Box3,Group,Vector3,type Object3D} from 'three';
import type {ConstructionPresentation} from '../../content/schema';
import type {VisualEffect} from '../../content/effects/schema';
import {EffectPlayer} from '../abilities/effectPlayer';

/** Progress is authoritative; seeking/loading never replays the build animation. */
export function constructionPose(progress:number,c:Pick<ConstructionPresentation,'revealAt'|'retractUntil'>){
 const p=Math.max(0,Math.min(1,Number.isFinite(progress)?progress:0));
 const rise=p<c.revealAt?p/c.revealAt:Math.max(0,1-(p-c.revealAt)/(c.retractUntil-c.revealAt));
 return {height:rise,buildingVisible:p>=c.revealAt};
}

/** Grounded enclosure with shared immutable geometry and per-instance transform. */
export class ConstructionScaffold {
 readonly root=new Group();
 private readonly size=new Vector3();
 private readonly centre=new Vector3();
 private readonly groundY:number;
 private progress:number|undefined;
 private lastDust=-Infinity;
 private nextDust=-Infinity;
 private dust:Array<{handle:number;end:number}>=[];
 constructor(readonly config:ConstructionPresentation,model:Object3D,body:Object3D,private effects:EffectPlayer,private dustEffect:VisualEffect){
  // Both inputs are detached/local: entity heading and world terrain elevation must
  // not inflate the fitted box. Body already carries its declared visual scale.
  const localBody=body.clone(true);localBody.updateMatrixWorld(true);
  const building=new Box3().setFromObject(localBody);
  building.getSize(this.size);building.getCenter(this.centre);
  this.size.addScalar(config.padding*2);
  const bounds=new Box3().setFromObject(model),source=bounds.getSize(new Vector3());
  const origin=bounds.getCenter(new Vector3());
  model.scale.set(this.size.x/Math.max(.001,source.x),this.size.y/Math.max(.001,source.y),this.size.z/Math.max(.001,source.z));
  model.position.set(-origin.x*model.scale.x,-bounds.min.y*model.scale.y,-origin.z*model.scale.z);
  this.groundY=Math.min(0,building.min.y);
  this.root.position.set(this.centre.x,this.groundY,this.centre.z);
  this.root.add(model);this.root.name='Construction scaffold';
 }
 update(progress:number,tick:number,visible:boolean,id:number){
  const pose=constructionPose(progress,this.config);
  this.root.visible=visible&&pose.height>0;
  // Reveal rigid scaffold geometry from below the terrain; ladders and posts
  // retain their proportions during both the rise and the final retraction.
  const buriedHeight=this.size.y*(1-pose.height);
  this.root.position.y=this.groundY-buriedHeight;
  this.dust=this.dust.filter(d=>d.end>tick);
  // No history burst on map load, no dust for paused or remembered construction.
  if(!visible||progress>=1||tick<this.lastDust){this.clearDust();}
  if(visible&&this.progress!==undefined&&progress>this.progress&&progress<1&&tick>=this.nextDust){
   this.root.updateWorldMatrix(true,false);
   // Local visual noise: independent spots and timing, never a perimeter sweep
   // or a consumer of the lockstep simulation's random stream.
   const seed=(Math.imul(id,0x9e3779b1)^Math.floor(tick))>>>0;
   const random=(salt:number)=>{
    let n=seed^Math.imul(salt+1,0x85ebca6b);
    n=Math.imul(n^(n>>>16),0x7feb352d);n=Math.imul(n^(n>>>15),0x846ca68b);
    return ((n^(n>>>16))>>>0)/4294967296;
   };
   const x=this.size.x*.5,z=this.size.z*.5,visibleHeight=this.size.y*pose.height;
   const tail=Math.max(0,...this.dustEffect.layers.map(l=>(l.startTick??0)+(l.durationTicks??0)+(l.emitter?.lifetimeTicks??0)));
   // Two broad roof patches plus one independently chosen side/edge patch.
   // All three appear together, so no ordering is visible around the enclosure.
   for(let i=0;i<3;i++){
    const local=new Vector3((random(i*5)*2-1)*x,this.size.y+.15,(random(i*5+1)*2-1)*z);
    if(i===2){
     const edge=Math.floor(random(i*5+2)*4);
     if(edge<2)local.x=(edge===0?-1:1)*(x+.35);
     else local.z=(edge===2?-1:1)*(z+.35);
     local.y=buriedHeight+Math.max(.15,visibleHeight*random(i*5+3));
    }
    const point=this.root.localToWorld(local);
    const handle=this.effects.play(this.dustEffect,{tick,seed:(seed+Math.imul(i+1,7919))>>>0,target:{x:point.x,y:point.z,height:point.y}});
    this.dust.push({handle,end:tick+this.dustEffect.durationTicks+tail});
   }
   this.lastDust=tick;
   this.nextDust=tick+this.config.dustIntervalTicks*(.7+random(31)*.6);
  }
  this.progress=progress;
  return pose;
 }
 private clearDust(){for(const d of this.dust)this.effects.stop(d.handle);this.dust=[];}
 dispose(){this.clearDust();this.root.removeFromParent();}
}
