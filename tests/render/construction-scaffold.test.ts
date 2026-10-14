import {expect,it,vi} from 'vitest';
import {Box3,BoxGeometry,Mesh,MeshBasicMaterial,Group,Vector3} from 'three';
import {ConstructionScaffold,constructionPose} from '../../src/render/settlement/constructionScaffold';
import type {EffectPlayer} from '../../src/render/abilities/effectPlayer';
import type {VisualEffect} from '../../src/content/effects/schema';
const config={scaffold:'scaffold',padding:.3,revealAt:.95,retractUntil:.99,dustEffect:'dust',dustIntervalTicks:8};
it('grows to full enclosure, reveals at 95%, then retracts without shrinking the building',()=>{
 expect(constructionPose(0,config)).toEqual({height:0,buildingVisible:false});
 expect(constructionPose(.475,config)).toEqual({height:.5,buildingVisible:false});
 expect(constructionPose(.95,config)).toEqual({height:1,buildingVisible:true});
 expect(constructionPose(.97,config).height).toBeCloseTo(.5);
 expect(constructionPose(1,config)).toEqual({height:0,buildingVisible:true});
});
it('fits buildings once and raises rigid geometry from below ground',()=>{
 const body=new Mesh(new BoxGeometry(5,8,3),new MeshBasicMaterial());body.position.y=4;
 const source=new Mesh(new BoxGeometry(1,1,1),new MeshBasicMaterial());
 const fx={play:vi.fn(),stop:vi.fn()} as unknown as EffectPlayer;
 const scaffold=new ConstructionScaffold(config,source,body,fx,{durationTicks:40,layers:[]} as unknown as VisualEffect);
 const bounds=new Box3().setFromObject(scaffold.root);
 expect(bounds.getSize(new Vector3()).toArray()).toEqual([5.6,8.6,3.6]);
 expect(bounds.min.y).toBeCloseTo(0);
 for(const [progress,top] of [[0,0],[.475,4.3],[.95,8.6],[.97,4.3],[1,0]]){
  scaffold.update(progress,0,true,1);
  const raised=new Box3().setFromObject(scaffold.root);
  expect(raised.getSize(new Vector3()).toArray()).toEqual([5.6,8.6,3.6]);
  expect(raised.max.y).toBeCloseTo(top);
  expect(raised.min.y).toBeCloseTo(top-8.6);
  expect(scaffold.root.scale.toArray()).toEqual([1,1,1]);
 }
 expect(body.scale.toArray()).toEqual([1,1,1]);
});
it('emits only for progressing visible construction and cleans active dust on fog/cancel',()=>{
 const play=vi.fn().mockReturnValue(12),stop=vi.fn();
 const body=new Mesh(new BoxGeometry(5,5,5),new MeshBasicMaterial());body.position.y=2.5;
 const s=new ConstructionScaffold(config,new Mesh(new BoxGeometry(1,1,1)),body,{play,stop} as unknown as EffectPlayer,{durationTicks:40,layers:[]} as unknown as VisualEffect);
 new Group().add(s.root);
 s.update(.5,100,true,1);expect(play).not.toHaveBeenCalled();
 s.update(.5,120,true,1);expect(play).not.toHaveBeenCalled();
 s.update(.6,128,true,1);expect(play).toHaveBeenCalledTimes(3);
 s.update(.7,130,true,1);expect(play).toHaveBeenCalledTimes(3);
 s.update(.7,140,false,1);expect(stop).toHaveBeenCalledWith(12);
 s.update(.8,150,true,1);expect(play).toHaveBeenCalledTimes(6);
 s.dispose();expect(s.root.parent).toBeNull();expect(stop).toHaveBeenCalledTimes(6);
});

it('keeps work dust above terrain while the scaffold is mostly buried',()=>{
 const play=vi.fn().mockReturnValue(1),body=new Mesh(new BoxGeometry(5,8,3));body.position.y=4;
 const s=new ConstructionScaffold(config,new Mesh(new BoxGeometry(1,1,1)),body,{play,stop:vi.fn()} as unknown as EffectPlayer,{durationTicks:40,layers:[]} as unknown as VisualEffect);
 const parent=new Group();parent.position.set(20,7,30);parent.rotation.y=Math.PI/2;parent.add(s.root);
 s.update(.01,0,true,1);s.update(.095,8,true,1);
 const target=play.mock.calls[0][1].target;
 expect(target.height).toBeCloseTo(7+.86+.15);
 for(const [,options] of play.mock.calls){
  expect(options.target.height).toBeGreaterThanOrEqual(7);
  expect(options.target.height).toBeLessThanOrEqual(7+.86+.15+.00001);
 }
 s.dispose();
});
