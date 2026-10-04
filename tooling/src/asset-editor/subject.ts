import {AxesHelper,Box3,Box3Helper,Group,Mesh,MeshStandardMaterial,SkeletonHelper,Texture,Vector3,type Object3D} from 'three';
import {GLTFLoader,type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {createCharacterInstance,type CharacterPlayer,type AntState} from '../../../src/render/characters/character-player.js';
import {applyPlayerMaterials} from '../../../src/render/settlement/playerMaterials';
import {transformedModel} from '../../../src/render/prop/modelTransform';
import {prototypeBounds} from '../../../src/render/prop/grounding';
import type {AssetDefinition} from '../../../src/shared/authoring/asset';

export type SubjectControls={state:string;paused:boolean;speed:number;owner:number;wireframe:boolean;skeleton:boolean;sockets:boolean;bounds:boolean;speech:number};
export const defaultSubjectControls=():SubjectControls=>({state:'idle',paused:false,speed:1.5,owner:0,wireframe:false,skeleton:false,sockets:false,bounds:false,speech:0});
export type SubjectInfo={triangles:number;primitives:number;bones:number;clips:string[];states:string[];materials:string[];textures:number};
export function releaseModel(gltf:GLTF){
 const geometries=new Set(),materials=new Set<MeshStandardMaterial>(),textures=new Set<Texture>();
 gltf.scene.traverse(o=>{if(o instanceof Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});
 for(const g of geometries)(g as Mesh['geometry']).dispose();
 for(const m of materials){for(const value of Object.values(m))if(value instanceof Texture)textures.add(value);m.dispose();}
 for(const t of textures){t.dispose();const image=t.source.data;if(typeof ImageBitmap!=='undefined'&&image instanceof ImageBitmap)image.close();}
}
/** One loaded prototype, independent skeleton/materials per preview instance. Uses
 * the same player, transforms and ownership shader as live game entities. */
export class InspectionSubject {
 attackContact(){return this.instances[0]?.player?.attackContact()??.55;}
 readonly root=new Group();readonly info:SubjectInfo;
 private instances:{root:Object3D;player?:CharacterPlayer;dispose:()=>void}[]=[];
 private debug=new Group();private helpers:SkeletonHelper[]=[];private sockets:AxesHelper[]=[];
 private bounds=new Box3Helper(new Box3(),0xf2c36b);
 private controls=defaultSubjectControls();
 private constructor(private gltf:GLTF,asset:AssetDefinition,readonly count:number){
  const materials=new Set<MeshStandardMaterial>(),bones=new Set<Object3D>(),textures=new Set<Texture>();let triangles=0,primitives=0;
  gltf.scene.traverse(o=>{if(o.type==='Bone')bones.add(o);if(o instanceof Mesh){primitives++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position?.count??0)/3;for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});
  for(const m of materials)for(const value of Object.values(m))if(value instanceof Texture)textures.add(value);
  let profile:any;gltf.scene.traverse(o=>{if(o.userData.characterProfile)profile=o.userData.characterProfile;});
  const variant=asset.bindings.render.find(b=>b.character)?.character??Object.keys(profile?.variants??{})[0]??(asset.capabilities.animations?.length?'base':undefined);
  const states=asset.capabilities.animations?.map(a=>a.semantic)??Object.keys(profile?.variants?.[variant??'']?.states??{});
  this.info={triangles,primitives,bones:bones.size,textures:textures.size,materials:[...materials].map(m=>m.name),clips:gltf.animations.map(c=>c.name),states};
  for(let i=0;i<count;i++){
   let instance:{root:Object3D;player?:CharacterPlayer;dispose:()=>void};
   if(variant&&(profile||asset.capabilities.animations?.length))instance=createCharacterInstance(gltf,variant,asset.capabilities);
   else{const root=clone(gltf.scene),owned=new Map<MeshStandardMaterial,MeshStandardMaterial>();root.traverse(o=>{if(o instanceof Mesh){const copy=(m:MeshStandardMaterial)=>{if(!owned.has(m))owned.set(m,m.clone());return owned.get(m)!;};o.material=Array.isArray(o.material)?o.material.map(copy):copy(o.material);}});instance={root,dispose(){for(const m of owned.values())m.dispose();root.removeFromParent();}};}
   instance.root.traverse(o=>{if(o instanceof Mesh){o.castShadow=true;o.receiveShadow=true;}});
   const wrapper=transformedModel(instance.root,asset.transform,asset.capabilities.groundContact?.mode==='terrain'?-prototypeBounds(instance.root).min.y:0);
   if(count>1)wrapper.position.set((i%4-1.5)*3,0,(Math.floor(i/4)-1)*3);
   this.root.add(wrapper);this.instances.push(instance);
   if(i===0){
    const skeleton=new SkeletonHelper(instance.root);this.debug.add(skeleton);this.helpers.push(skeleton);
    for(const socket of asset.capabilities.sockets??[]){const node=instance.root.getObjectByName(socket.node);if(!node)continue;const axes=new AxesHelper(.45);axes.name=socket.name;axes.position.fromArray(socket.offset);node.add(axes);this.sockets.push(axes);}
   }
  }
  this.debug.matrixAutoUpdate=false;this.root.add(this.debug);this.debug.add(this.bounds);this.configure(this.controls);
 }
 static async load(asset:AssetDefinition,url:string,count:number){return new InspectionSubject(await new GLTFLoader().loadAsync(url),asset,count);}
 configure(controls:SubjectControls){
  const changedState=controls.state!==this.controls.state;
  this.controls={...controls};
  for(const instance of this.instances){
   const p=instance.player;if(p){p.paused=controls.paused;p.speed=controls.speed;if(changedState&&p.hasState(controls.state as AntState))p.setState(controls.state as AntState);}
   applyPlayerMaterials(instance.root,controls.owner);
   instance.root.traverse(o=>{if(o instanceof Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m instanceof MeshStandardMaterial)m.wireframe=controls.wireframe;});
  }
  for(const h of this.helpers)h.visible=controls.skeleton;
  for(const h of this.sockets)h.visible=controls.sockets;
  this.bounds.visible=controls.bounds;
 }
 update(dt:number){this.root.updateMatrixWorld(true);this.debug.matrix.copy(this.root.matrixWorld).invert();for(const i of this.instances){i.player?.update(dt);i.player?.speak(this.controls.speech);}if(this.controls.bounds)this.bounds.box.copy(this.worldBounds());}
 seek(value:number){for(const i of this.instances)i.player?.seek(value);}
 restart(){for(const i of this.instances)if(i.player?.hasState(this.controls.state as AntState))i.player.setState(this.controls.state as AntState,{restart:true,fade:0});}
 progress(){const p=this.instances[0]?.player;return p?{state:p.state,phase:p.action.time/p.action.getClip().duration}:undefined;}
 worldBounds(){const box=new Box3();this.root.updateMatrixWorld(true);for(const i of this.instances)box.union(new Box3().setFromObject(i.root));return box;}
 dimensions(){return this.worldBounds().getSize(new Vector3());}
 dispose(){for(const i of this.instances)i.dispose();for(const h of [...this.helpers,...this.sockets,this.bounds])h.dispose();this.root.removeFromParent();releaseModel(this.gltf);}
}
