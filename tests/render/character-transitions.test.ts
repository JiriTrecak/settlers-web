import {describe,it,expect} from 'vitest';
import {Group,Bone,AnimationClip,VectorKeyframeTrack} from 'three';
import {CharacterPlayer} from '../../src/render/characters/character-player.js';
function setup(){
 const root=new Group(),bone=new Bone();bone.name='Torso';root.add(bone);
 root.userData.characterProfile={variants:{base:{states:{idle:'idle',walk:'walk',run:'run',charge:'run',attack:'attack'}}},attackEvents:{base:{normalizedTime:.55,event:'hit'}}};
 const clips=[['idle',0],['walk',2],['run',4],['attack',10]].map(([name,x])=>new AnimationClip(String(name),1,[new VectorKeyframeTrack('Torso.position',[0,1],[Number(x),0,0,Number(x),0,0])]));
 const player=new CharacterPlayer(root,clips);player.speed=1;player.setState('run');player.update(.2);return {player,bone};
}
describe('live animation transitions',()=>{
 it('blends into an authoritative attack while retaining its exact contact time',()=>{
  const {player,bone}=setup();expect(bone.position.x).toBeCloseTo(4);
  player.setState('attack');player.sample(.2,0);expect(bone.position.x).toBeCloseTo(4);
  player.sample(.3,.09);expect(bone.position.x).toBeGreaterThan(4);expect(bone.position.x).toBeLessThan(10);expect(player.action.time).toBeCloseTo(.3);
  player.sample(.55,.1);expect(bone.position.x).toBeCloseTo(10);expect(player.action.time).toBeCloseTo(.55);
  player.setState('idle');player.update(0);expect(bone.position.x).toBeCloseTo(10);
  player.update(.09);expect(bone.position.x).toBeGreaterThan(0);expect(bone.position.x).toBeLessThan(10);
  player.update(.1);expect(bone.position.x).toBeCloseTo(0);player.dispose();
 });
 it('retains gait phase for aliases and keeps editor seeking exact',()=>{
  const {player,bone}=setup();const time=player.action.time;
  player.setState('charge');expect(player.action.time).toBe(time);
  player.setState('attack');player.seek(.6);expect(bone.position.x).toBeCloseTo(10);expect(player.action.time).toBeCloseTo(.6);
  player.dispose();
 });
 it('does not jump when another state interrupts an unfinished blend',()=>{
  const {player,bone}=setup();player.setState('attack');player.sample(.1,.06);const before=bone.position.x;
  player.setState('walk');player.update(0);expect(bone.position.x).toBeCloseTo(before);
  player.update(.3);expect(bone.position.x).toBeCloseTo(2);player.dispose();
 });
});

describe('canonical character metadata',()=>{
 it('overrides embedded clip mappings and hit timing in game and workbench',()=>{
  const {player}=setup();const root=player.root;player.dispose();
  const clips=[new AnimationClip('rest',2,[]),new AnimationClip('strike',2,[])];
  const canonical=new CharacterPlayer(root,clips,'base',{animations:[{semantic:'idle',clip:'rest',loop:true,events:[]},{semantic:'attack',clip:'strike',loop:false,events:[{name:'release',time:.4}]}]});
  expect(canonical.action.getClip().name).toBe('rest');expect(canonical.attackContact()).toBe(.2);
  const events:string[]=[];canonical.onEvent=e=>events.push(e.type);canonical.speed=1;canonical.setState('attack',{fade:0});canonical.update(.39);expect(events).toEqual([]);canonical.update(.02);expect(events).toEqual(['release']);canonical.dispose();
 });
});
