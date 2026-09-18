import {readFileSync,writeFileSync} from 'node:fs';
import {AnimationMixer,Box3,LoopOnce,Mesh,SkinnedMesh,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const rows:unknown[]=[];
for(const role of ['civilian','warrior','archer','captain']){
 const path=`assets/models/units/ants/briar-${role}/model.glb`,b=readFileSync(path),data=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
 const gltf=await new GLTFLoader().parseAsync(data,'');const scene=gltf.scene,mixer=new AnimationMixer(scene),names=gltf.animations.map(a=>a.name);
 for(const expected of ['idle','walk','run','carry','hit','death'])if(!names.includes(expected))throw Error(`${role}: missing ${expected}`);
 let skins=0;scene.traverse(o=>{if(o instanceof SkinnedMesh){skins++;if(o.skeleton.bones.length<20)throw Error(`${role}: invalid skeleton`);} });if(!skins)throw Error(`${role}: no skin`);
 const sampled=[];
 for(const clip of gltf.animations){
  mixer.stopAllAction();const action=mixer.clipAction(clip);action.setLoop(LoopOnce,1);action.clampWhenFinished=true;action.play();
  const bounds=new Box3();
  for(let i=0;i<=12;i++){
   mixer.setTime(clip.duration*i/12);scene.updateMatrixWorld(true);
   scene.traverse(o=>{if(o instanceof SkinnedMesh){o.skeleton.update();o.computeBoundingBox();} });
   const pose=new Box3().setFromObject(scene,true);if(![...pose.min.toArray(),...pose.max.toArray()].every(Number.isFinite))throw Error(`${role}/${clip.name}: nonfinite pose`);
   const size=pose.getSize(new Vector3());if(size.length()>8||size.length()<.1)throw Error(`${role}/${clip.name}: broken scale`);bounds.union(pose);
  }
  sampled.push({clip:clip.name,seconds:clip.duration,min:bounds.min.toArray(),max:bounds.max.toArray()});
 }
 rows.push({path,skins,samples:sampled});
}
writeFileSync('artifacts/briarwatch/animation-validation.json',JSON.stringify(rows,null,2));console.log(`Validated ${rows.length} animated GLBs, every clip sampled at 13 poses.`);
