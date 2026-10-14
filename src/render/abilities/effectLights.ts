import {Object3D,PointLight,Scene,Vector3} from 'three';
export type EffectLightSource={root:Object3D;light:PointLight};
const pools=new WeakMap<Scene,EffectLights>();
/** A fixed scene-wide budget: changing intensity never changes NUM_POINT_LIGHTS.
 * Logical cue lights stay off-scene, so expiration cannot recompile every lit material. */
export class EffectLights {
 private readonly lights=Array.from({length:4},()=>new PointLight(0xffffff,0,1,2));
 private readonly sources=new Map<object,readonly EffectLightSource[]>();
 private readonly position=new Vector3();
 constructor(private scene:Scene){for(const light of this.lights){light.name='effects.pooled-light';scene.add(light);}}
 sync(owner:object,sources:readonly EffectLightSource[]){if(sources.length)this.sources.set(owner,sources);else this.sources.delete(owner);this.refresh();}
 private refresh(){
  let slot=0;
  for(const sources of this.sources.values())for(const {root,light} of sources){
   let visible=!!root.parent;for(let p:Object3D|null=root;p;p=p.parent)visible&&=p.visible;
   if(!visible||light.intensity<=0||slot===this.lights.length)continue;
   const target=this.lights[slot++];root.updateWorldMatrix(true,false);
   this.position.copy(light.position).applyMatrix4(root.matrixWorld);target.position.copy(this.position);
   target.color.copy(light.color);target.intensity=light.intensity;target.distance=light.distance;target.decay=light.decay;
  }
  for(;slot<this.lights.length;slot++)this.lights[slot].intensity=0;
 }
 dispose(){for(const light of this.lights){light.removeFromParent();light.dispose();}this.sources.clear();pools.delete(this.scene);}
}
export function effectLights(scene:Scene){let pool=pools.get(scene);if(!pool){pool=new EffectLights(scene);pools.set(scene,pool);}return pool;}
export function containingScene(root:Object3D){for(let p:Object3D|null=root;p;p=p.parent)if(p instanceof Scene)return p;}
