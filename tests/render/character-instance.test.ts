import {describe,expect,it} from 'vitest';
import {AnimationClip,Bone,BoxGeometry,Float32BufferAttribute,Group,Object3D,MeshStandardMaterial,Quaternion,QuaternionKeyframeTrack,Skeleton,SkinnedMesh,Texture,Uint16BufferAttribute,Vector3} from 'three';
import {createCharacterInstance} from '../../src/render/characters/character-player.js';

/** A code-built skinned character: one team-coloured and one natural part on a shared two-bone skeleton. */
function rig(){
 const scene=new Group(),hips=new Bone(),spine=new Bone(),jaw=new Bone();
 hips.name='Hips';spine.name='Spine';jaw.name='Jaw';hips.add(spine);spine.add(jaw);scene.add(hips);
 const geometry=new BoxGeometry(1,1,1),count=geometry.getAttribute('position').count;
 geometry.setAttribute('skinIndex',new Uint16BufferAttribute(Array.from({length:count*4},(_,i)=>i%4===0?1:0),4));
 geometry.setAttribute('skinWeight',new Float32BufferAttribute(Array.from({length:count*4},(_,i)=>i%4===0?1:0),4));
 const team=new SkinnedMesh(geometry,new MeshStandardMaterial({name:'TC_TeamColor',map:new Texture()}));
 const shell=new SkinnedMesh(geometry,new MeshStandardMaterial({name:'Shell',color:0x804020,map:new Texture()}));
 scene.add(team,shell);scene.updateMatrixWorld(true);
 const skeleton=new Skeleton([hips,spine,jaw]);team.bind(skeleton);shell.bind(skeleton);
 scene.userData.characterProfile={variants:{base:{states:{idle:'idle',attack:'attack',death:'death'}}},attackEvents:{base:{event:'hit',normalizedTime:.5}}};
 scene.userData.speechRig={bones:[{name:'Jaw',axis:[1,0,0],angle:.3}]};
 const turn=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),Math.PI/2).toArray();
 const clip=(name:string,to:number[])=>new AnimationClip(name,1,[new QuaternionKeyframeTrack('Spine.quaternion',[0,1],[0,0,0,1,...to])]);
 return {scene,animations:[clip('idle',[0,0,0,1]),clip('attack',turn),clip('death',turn)]};
}
const materials=(root:Object3D)=>{const out:MeshStandardMaterial[]=[];root.traverse((o:any)=>{if(o.isMesh)out.push(...(Array.isArray(o.material)?o.material:[o.material]));});return out;};

describe('character instances',()=>{
 it('isolate player colours and skeleton poses while sharing textures',()=>{
  const gltf=rig(),a=createCharacterInstance(gltf),b=createCharacterInstance(gltf);
  const am=materials(a.root),bm=materials(b.root),natural=am.filter(m=>m.name!=='TC_TeamColor').map(m=>m.color.clone());
  a.player.setTeamColor('#cb3030');b.player.setTeamColor('#286bdb');
  const team=(ms:MeshStandardMaterial[])=>ms.find(m=>m.name==='TC_TeamColor')!;
  expect(team(am).color.equals(team(bm).color)).toBe(false);
  am.filter(m=>m.name!=='TC_TeamColor').forEach((m,i)=>expect(m.color.equals(natural[i])).toBe(true));
  am.forEach((m,i)=>{expect(m).not.toBe(bm[i]);expect(m.map).toBe(bm[i].map);});
  a.player.setTeamColor('default');expect(team(am).color.getHex()).toBe(0xffffff);
  const bone=b.root.getObjectByName('Spine')!,before=bone.quaternion.clone();
  a.player.setState('attack');a.player.seek(.5);
  expect(bone.quaternion.equals(before)).toBe(true);
  expect(a.root.getObjectByName('Spine')!.quaternion.equals(before)).toBe(false);
  a.dispose();b.player.update(.1);b.dispose();
 });
 it('fires one impact at the mapped contact, returns to idle and clamps death',()=>{
  const a=createCharacterInstance(rig()),events:string[]=[];a.player.onEvent=(e:{type:string})=>events.push(e.type);
  a.player.setState('attack');
  const contactSeconds=a.player.clipDuration()*a.player.attackContact()/a.player.speed;
  a.player.update(contactSeconds-.01);expect(events).toEqual([]);
  a.player.update(.02);expect(events).toEqual(['hit']);
  a.player.update(2);expect(events).toEqual(['hit']);expect(a.player.state).toBe('idle');
  a.player.setState('death');a.player.update(5);
  expect(a.player.state).toBe('death');expect(a.player.action.paused).toBe(true);
  a.dispose();
 });
 it('drives a speech hinge from dialogue amplitude and silences it in death',()=>{
  const a=createCharacterInstance(rig()),jaw=a.root.getObjectByName('Jaw')!,rest=jaw.quaternion.clone();
  a.player.speak(1);expect(jaw.quaternion.angleTo(rest)).toBeCloseTo(.3,5);
  a.player.speak(0);expect(jaw.quaternion.angleTo(rest)).toBeCloseTo(0,5);
  a.player.setState('death');a.player.speak(1);expect(jaw.quaternion.angleTo(rest)).toBeCloseTo(0,5);
  a.dispose();
  const silent=rig();delete silent.scene.userData.speechRig;
  const b=createCharacterInstance(silent);expect(()=>{b.player.speak(1);b.player.speak(0);}).not.toThrow();b.dispose();
 });
});
