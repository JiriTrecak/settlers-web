import {it,expect} from 'vitest';
import {AnimationClip,Box3,BoxGeometry,Group,Mesh,MeshStandardMaterial,Quaternion,QuaternionKeyframeTrack,Vector3,VectorKeyframeTrack} from 'three';
import {TreePlayer} from '../../src/render/prop/treePlayer';

const FALL_TICKS=72,DECAY_TICKS=240,TICKS_PER_SECOND=40;
/** Code-built tree: a 10 m trunk on a pivot with authored hit sway, a 90° fall and a decay that sinks the felled crown. */
function tree(){
 const scene=new Group(),pivot=new Group(),geometry=new BoxGeometry(1,10,1);geometry.translate(0,5,0);
 pivot.name='TreePivot';pivot.add(new Mesh(geometry,new MeshStandardMaterial()));scene.add(pivot);
 const q=(angle:number)=>new Quaternion().setFromAxisAngle(new Vector3(1,0,0),angle).toArray();
 const fallen=q(Math.PI/2),fall=FALL_TICKS/TICKS_PER_SECOND,decay=DECAY_TICKS/TICKS_PER_SECOND;
 const animations=[
  new AnimationClip('hit',.5,[new QuaternionKeyframeTrack('TreePivot.quaternion',[0,.25,.5],[...q(0),...q(.15),...q(0)])]),
  new AnimationClip('fall',fall,[new QuaternionKeyframeTrack('TreePivot.quaternion',[0,fall],[...q(0),...fallen])]),
  new AnimationClip('decay',decay,[new QuaternionKeyframeTrack('TreePivot.quaternion',[0,decay],[...fallen,...fallen]),new VectorKeyframeTrack('TreePivot.position',[0,decay],[0,0,0,0,-2,0])]),
 ];
 return {scene,animations};
}

it('samples hit/fall/decay clips at 1x from felling ticks, sinks at full size, and keeps instances independent',()=>{
 const g=tree(),a=g.scene.clone(true),untouched=g.scene.clone(true),player=new TreePlayer(a,g.animations);
 const standing=new Box3().setFromObject(untouched);
 const f={hp:9,lastHitTick:0,fallTick:null as number|null,direction:{x:0,y:1}};
 player.sample(f,10,FALL_TICKS,DECAY_TICKS);expect(player.state).toBe('hit');
 expect(new Box3().setFromObject(a).equals(standing)).toBe(false);
 player.sample(f,24,FALL_TICKS,DECAY_TICKS);
 expect(new Box3().setFromObject(a).max.distanceTo(standing.max)).toBeLessThan(.001);
 f.hp=0;f.fallTick=f.lastHitTick=100;
 player.sample(f,100+FALL_TICKS-.001,FALL_TICKS,DECAY_TICKS);expect(player.state).toBe('fall');
 const fallen=new Box3().setFromObject(a);
 expect(fallen.max.y).toBeLessThan(standing.max.y/2);
 player.sample(f,100+FALL_TICKS,FALL_TICKS,DECAY_TICKS);expect(player.state).toBe('decay');
 expect(new Box3().setFromObject(a).max.distanceTo(fallen.max)).toBeLessThan(.01);
 player.sample(f,100+FALL_TICKS+DECAY_TICKS-.01,FALL_TICKS,DECAY_TICKS);
 expect(new Box3().setFromObject(a).max.y).toBeLessThan(0);
 a.traverse(o=>expect(o.scale.distanceTo(new Vector3(1,1,1))).toBeLessThan(.001));
 expect(player.sample(f,100+FALL_TICKS+DECAY_TICKS,FALL_TICKS,DECAY_TICKS)).toBe(false);expect(a.visible).toBe(false);
 expect(new Box3().setFromObject(untouched).equals(standing)).toBe(true);
 player.dispose();
});

it('rejects a tree model without the required clips',()=>{
 const g=tree();expect(()=>new TreePlayer(g.scene,g.animations.filter(c=>c.name!=='decay'))).toThrow('decay');
});
