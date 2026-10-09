import {Color, Sprite, SpriteMaterial, Vector2, Vector3, type Camera} from 'three';
import {healthColor, healthRatio} from '../../presentation/health';

export type VitalValues = {hp:number; maxHp:number; mana?:number; maxMana?:number};
export const HEALTH_BAR_HEIGHT = 8;
export const MANA_BAR_HEIGHT = 5;
export const VITAL_BAR_GAP = 2;
export function vitalBarSize(building:boolean, maxMana = 0): Vector2 {
  return new Vector2(building ? 76 : 52, HEALTH_BAR_HEIGHT + (maxMana > 0 ? VITAL_BAR_GAP + MANA_BAR_HEIGHT : 0));
}
/** World scale for CSS pixels, for both perspective and orthographic cameras. */
export function barWorldUnitsPerPixel(camera:Camera, viewportHeight:number, viewDepth:number):number {
  const perspective = camera.projectionMatrix.elements[11] === -1;
  return 2 * (perspective ? Math.max(.001, viewDepth) : 1) /
    (Math.max(1, viewportHeight) * camera.projectionMatrix.elements[5]!);
}

/** One tiny procedural sprite per entity. HP/mana change uniforms, never textures or programs. */
export class VitalBar extends Sprite {
  private readonly uniforms = {
    uBarSize:{value:new Vector2()}, uHealth:{value:1}, uHealthMax:{value:100},
    uHealthColor:{value:new Color()}, uMana:{value:0}, uHasMana:{value:0},
  };
  private readonly world = new Vector3();
  private readonly view = new Vector3();
  private readonly parentScale = new Vector3();
  constructor(readonly building:boolean) {
    const material = new SpriteMaterial({depthTest:false, depthWrite:false, toneMapped:false, fog:false});
    super(material);
    this.name='Health';this.renderOrder=21;this.raycast=()=>{};
    // Anchor the bottom of the complete stack above the model.
    this.center.set(.5,0);
    this.uniforms.uBarSize.value.copy(vitalBarSize(building));
    material.customProgramCacheKey=()=> 'vital-bar-v1';
    material.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,this.uniforms);
      shader.vertexShader='varying vec2 vBarUv;\n'+shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nvBarUv = uv;');
      shader.fragmentShader=`varying vec2 vBarUv;
        uniform vec2 uBarSize;
        uniform float uHealth, uHealthMax, uMana, uHasMana;
        uniform vec3 uHealthColor;
      `+shader.fragmentShader.replace('#include <map_fragment>',`
        vec2 p = vec2(vBarUv.x, 1.0-vBarUv.y) * uBarSize;
        bool mana = p.y >= 10.0;
        float localY = mana ? p.y-10.0 : p.y;
        float rowHeight = mana ? 5.0 : 8.0;
        if ((p.y >= 8.0 && p.y < 10.0) || (mana && uHasMana < .5)) discard;
        vec3 bar = vec3(.008, .012, .016);
        bool inner = p.x >= 1.0 && p.x < uBarSize.x-1.0 && localY >= 1.0 && localY < rowHeight-1.0;
        if (inner) {
          float x = (p.x-1.0)/(uBarSize.x-2.0);
          float fill = mana ? uMana : uHealth;
          bar = vec3(.018, .023, .026);
          if (x < fill) {
            vec3 tint = mana ? vec3(.024, .19, .66) : uHealthColor;
            float shade = mix(1.24, .62, (localY-1.0)/(rowHeight-2.0));
            bar = tint * shade;
            if(localY < 2.0) bar += vec3(.055);
          }
          // Dark one-pixel separators at exact 100-HP boundaries, including the empty portion.
          // Fade only when subpixel spacing would turn high-HP bars into a solid dark slab.
          if (!mana && uHealthMax > 100.0) {
            float spacing = (uBarSize.x-2.0)*100.0/uHealthMax;
            float n = floor((p.x-1.0)/spacing+.5);
            float line = 1.0-smoothstep(.3,.8,abs((p.x-1.0)-n*spacing));
            if(n >= 1.0 && n*100.0 < uHealthMax)
              bar = mix(bar,vec3(.025,.030,.032),line*.78*smoothstep(1.0,2.0,spacing));
          }
        }
        diffuseColor = vec4(bar, 1.0);
      `);
    };
  }
  setValues(values:VitalValues):void {
    const maxMana = values.maxMana ?? 0;
    this.uniforms.uHealth.value=healthRatio(values.hp,values.maxHp);
    this.uniforms.uHealthMax.value=Math.max(0,values.maxHp);
    this.uniforms.uHealthColor.value.setHex(healthColor(values.hp,values.maxHp));
    this.uniforms.uMana.value=healthRatio(values.mana??0,maxMana);
    this.uniforms.uHasMana.value=maxMana>0?1:0;
    this.uniforms.uBarSize.value.set(this.building?76:52, maxMana>0?15:8);
  }
  fitCamera(camera:Camera,viewportHeight:number):void {
    this.getWorldPosition(this.world);
    this.view.copy(this.world).applyMatrix4(camera.matrixWorldInverse);
    const units=barWorldUnitsPerPixel(camera,viewportHeight,-this.view.z);
    if(this.parent)this.parent.getWorldScale(this.parentScale);else this.parentScale.set(1,1,1);
    const size=this.uniforms.uBarSize.value;
    this.scale.set(size.x*units/Math.max(.001,this.parentScale.x),size.y*units/Math.max(.001,this.parentScale.y),1);
    // Frozen animation roots may skip recursive matrix updates; the overlay still follows the camera.
    this.updateMatrix();this.updateWorldMatrix(false,false);
  }
  dispose():void {this.material.dispose();}
}
