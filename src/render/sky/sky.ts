import {sampleDaytime,daytimeLabel,wrap24,DAY_CYCLE_SECONDS,type DaytimeColor,type DaytimeSample} from '../../shared/environment/dayCycle';
export {DAY_CYCLE_SECONDS} from '../../shared/environment/dayCycle';
import { FOREST, type GlobalLight } from '../../shared/environment/presets';
/**
 * Four held/authored lighting looks over a 24h clock.
 * Hour is authored (editor dock); play just ticks whatever is set.
 * Sun direction blends during dawn/dusk; stable phases reuse their lighting.
 */
import {
  AmbientLight,
  Color,
  DirectionalLight,
  HemisphereLight,
  Fog, Vector3, SRGBColorSpace,
  type Scene,
} from "three";
import { MAP_FRINGE, MAP_HALO } from "../../shared";


export type SkyState = {
  hour: number;
  playing: boolean;
  daySeconds: number;
  label: string;
};

const SCRUB = 9.5;
const UP = new Vector3(0, 1, 0);
function color(target:Color, value:DaytimeColor):Color {
  return target.setRGB(value.rgb[0]/255,value.rgb[1]/255,value.rgb[2]/255,SRGBColorSpace);
}

export class Sky {
  private profile:'temperate'|'winter'='temperate';
  setProfile(profile:'temperate'|'winter'){if(profile!==this.profile){this.profile=profile;this.applied=null;this.apply();}}
  hour = SCRUB;
  playing = false;
  daySeconds = DAY_CYCLE_SECONDS;
  private light:GlobalLight={...FOREST.light};
  setGlobalLight(light:GlobalLight):void {this.light={...light};this.applied=null;this.apply();}
  private baseSunIntensity=1;
  setSunTransmission(value:number){this.sun.intensity=this.baseSunIntensity*Math.max(0,Math.min(1,value));}
  private size = 256;
  private last: number | null = null;
  private interior = false;
  private current:DaytimeSample=sampleDaytime(SCRUB);
  private applied:DaytimeSample|null=null;
  private readonly tint=new Color();
  private readonly direction=new Vector3();
  setInterior(on:boolean){this.interior=on;this.applied=null;this.scene.fog=on?this.haze:null;this.apply();}
  daytime(){return this.interior?undefined:this.current;}
  fogModifiers(){return {daytimeFogTint:this.light.hazeColor,daytimeFogDistanceScale:this.light.hazeDistance/100};}
  private readonly ambient = new AmbientLight(0x8aa0b8, 0.45);
  private readonly hemi = new HemisphereLight(0x9ab4c8, 0x353330, 0.35);
  readonly sun = new DirectionalLight(0xfff2d6, 2.2);
  private readonly haze = new Fog(0x9bc9cd, 80, 200);
  private hazeDepth = 80;
  private readonly bg = new Color(0x2a2a2a);

  constructor(
    private readonly scene: Scene,
    size = 256,
  ) {
    this.scene.fog = null;
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.radius = 3;
    this.sun.shadow.blurSamples = 8;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.025;
    this.scene.add(this.ambient, this.hemi, this.sun, this.sun.target);
    this.resize(size);
    this.apply();
  }

  resize(size: number): void {
    this.size = size;
    const span = size + MAP_HALO * 2 + MAP_FRINGE * 2;
    const extent = span * 0.6;
    const cam = this.sun.shadow.camera;
    cam.left = -extent;
    cam.right = extent;
    cam.top = extent;
    cam.bottom = -extent;
    cam.near = 1;
    cam.far = size * 2.4;
    cam.updateProjectionMatrix();
    this.sun.target.position.set(size / 2, 0, size / 2);
    this.applied=null;this.apply();
  }

  focus(x:number,z:number,extent=70):void {
    const dx=x-this.sun.target.position.x,dz=z-this.sun.target.position.z;
    this.sun.target.position.set(x,0,z);this.sun.position.x+=dx;this.sun.position.z+=dz;
    const c=this.sun.shadow.camera;c.left=c.bottom=-extent;c.right=c.top=extent;c.updateProjectionMatrix();this.sun.target.updateMatrixWorld();
  }

  /** Start haze around the view's ground focus so zooming keeps nearby detail clear. */
  setAtmosphereDepth(depth: number): void {
    this.hazeDepth = depth;
    this.updateAtmosphere();
  }

  private updateAtmosphere(): void {
    this.haze.near = Math.max(1, this.hazeDepth - 5);
    this.haze.far = this.haze.near + this.light.hazeDistance;
  }

  setHour(hour: number): void {
    this.hour = wrap24(hour);
    this.apply();
  }

  setPlaying(on: boolean): void {
    this.playing = on;
    this.last = null;
  }

  setDaySeconds(n: number): void {
    this.daySeconds = Math.min(600, Math.max(20, n));
  }

  tick(now: number): void {
    if (this.playing) {
      const prev = this.last ?? now;
      this.hour = wrap24(this.hour + ((now - prev) / 1000 / this.daySeconds) * 24);
    }
    this.last = now;
    this.apply();
  }

  lightingDiagnostics() {
    return { phase:this.current.phase,source:this.current.look,lutWeights:this.current.lutWeights,pendingAttributes:["SkyBloomColor (mask generation)", "Colorize (runtime uniform defaults)"],preset:{...this.light},sunIntensity:this.sun.intensity,sunColor:this.sun.color.getHexString(),ambientIntensity:this.ambient.intensity,fillIntensity:this.hemi.intensity };
  }

  snapshot(): SkyState {
    return {
      hour: this.hour,
      playing: this.playing,
      daySeconds: this.daySeconds,
      label: periodOf(this.hour),
    };
  }

  /** Held looks never drift with the clock. Directions interpolate only during transitions. */
  private apply(): void {
    const sample=sampleDaytime(this.hour,this.profile);this.current=sample;
    if(sample===this.applied)return;
    this.applied=sample;
    const look=sample.look,light=this.light,tint=this.tint;
    this.updateAtmosphere();
    if(this.interior){
      this.sun.color.set(light.sunTint);this.sun.intensity=light.sunStrength;
      this.ambient.color.set(light.ambientTint);this.ambient.intensity=light.ambientStrength;
      this.hemi.color.set(light.skyTint);this.hemi.groundColor.set(light.bounceTint);this.hemi.intensity=light.fillStrength;
      this.bg.set(light.hazeColor);this.haze.color.copy(this.bg);
      const e=light.sunHeight*Math.PI/180,a=light.sunDirection*Math.PI/180;
      this.direction.set(Math.cos(e)*Math.sin(a),Math.sin(e),Math.cos(e)*Math.cos(a));
    }else{
      color(this.sun.color,look.sunColor).multiply(tint.set(light.sunTint));this.sun.intensity=look.sunColor.multiplier*light.sunStrength;
      color(this.ambient.color,look.ambient).multiply(tint.set(light.ambientTint));this.ambient.intensity=look.ambient.multiplier*light.ambientStrength;
      color(this.hemi.color,look.skyColor).multiply(tint.set(light.skyTint));this.hemi.groundColor.set(light.bounceTint).multiplyScalar(.15);this.hemi.intensity=look.skyColor.multiplier*light.fillStrength;
      color(this.bg,look.skyColor).multiplyScalar(look.skyColor.multiplier);
      // XML direction describes travelling light rays; Three positions the light toward their source.
      this.direction.fromArray(look.sunDirection).negate().normalize().applyAxisAngle(UP,light.sunDirection*Math.PI/180);
      if(light.sunHeight!==60){const elevation=Math.asin(this.direction.y),az=Math.atan2(this.direction.x,this.direction.z),e=Math.min(1.48,elevation*light.sunHeight/60);this.direction.set(Math.cos(e)*Math.sin(az),Math.sin(e),Math.cos(e)*Math.cos(az));}
    }
    this.baseSunIntensity=this.sun.intensity;
    this.scene.background=this.bg;this.sun.shadow.radius=light.shadowSoftness;
    this.sun.position.copy(this.direction).multiplyScalar(this.size*.85).add(this.sun.target.position);
    this.sun.target.updateMatrixWorld();
  }
}
export const periodOf=daytimeLabel;

export function formatHour(hour: number): string {
  const h = wrap24(hour);
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
