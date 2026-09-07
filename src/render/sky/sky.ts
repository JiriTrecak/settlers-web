/**
 * Moving key light + graded ambient for a 24h cycle.
 * Hour is authored (editor dock); play just ticks whatever is set.
 * Sun stays a DirectionalLight so tree / rock shadows swing with the clock.
 */
import {
  AmbientLight,
  Color,
  DirectionalLight,
  HemisphereLight,
  type Scene,
} from "three";
import { MAP_FRINGE, MAP_HALO } from "../../shared";


export type SkyState = {
  hour: number;
  playing: boolean;
  daySeconds: number;
  label: string;
};

type Stop = {
  hour: number;
  sun: number;
  sunI: number;
  amb: number;
  ambI: number;
  hemi: number;
  ground: number;
  bg: number;
  /** Multiply on MeshBasic leaf cards — same clock, no Lambert mud. */
  paint: number;
};

/** Keyframes wrap at 24. Dawn / noon / dusk / night are the readable beats. */
const STOPS: readonly Stop[] = [
  { hour: 0, sun: 0x83b4ff, sunI: 0.95, amb: 0x729fee, ambI: 0.2, hemi: 0x93b8ff, ground: 0x12110e, bg: 0x0c1018, paint: 0x3d4c68 },
  { hour: 5.2, sun: 0xff6a3a, sunI: 0.55, amb: 0x3a2a40, ambI: 0.28, hemi: 0x5a3a50, ground: 0x2a2018, bg: 0x1a1218, paint: 0xff7a48 },
  { hour: 6.4, sun: 0xff9a5c, sunI: 1.35, amb: 0x6a5a70, ambI: 0.36, hemi: 0xc47860, ground: 0x3a3028, bg: 0x2a2430, paint: 0xffa070 },
  { hour: 8, sun: 0xffd4a0, sunI: 1.9, amb: 0x7a90a8, ambI: 0.42, hemi: 0x8ab0c8, ground: 0x3a3830, bg: 0x2c343c, paint: 0xffe4c4 },
  { hour: 12, sun: 0xfff2d6, sunI: 2.2, amb: 0x8aa0b8, ambI: 0.48, hemi: 0x9ab4c8, ground: 0x353330, bg: 0x2e3844, paint: 0xfff6ec },
  { hour: 16.5, sun: 0xffc078, sunI: 1.85, amb: 0x8a7868, ambI: 0.4, hemi: 0xd4a070, ground: 0x3a3028, bg: 0x3a3438, paint: 0xffc888 },
  { hour: 18.2, sun: 0xff7040, sunI: 1.1, amb: 0x5a3a48, ambI: 0.32, hemi: 0xc05040, ground: 0x2a2018, bg: 0x241820, paint: 0xff6a40 },
  { hour: 20, sun: 0x83b4ff, sunI: 0.9, amb: 0x729fee, ambI: 0.24, hemi: 0x93b8ff, ground: 0x141410, bg: 0x0e121c, paint: 0x455572 },
  { hour: 24, sun: 0x83b4ff, sunI: 0.95, amb: 0x729fee, ambI: 0.2, hemi: 0x93b8ff, ground: 0x12110e, bg: 0x0c1018, paint: 0x3d4c68 },
];

const DEG = Math.PI / 180;
const PEAK = 62 * DEG;
const MOON = 16 * DEG;
const SCRUB = 9.5;

export class Sky {
  hour = SCRUB;
  playing = false;
  daySeconds = 90;
  private size = 256;
  private last = 0;
  private readonly ambient = new AmbientLight(0x8aa0b8, 0.45);
  private readonly hemi = new HemisphereLight(0x9ab4c8, 0x353330, 0.35);
  private readonly sun = new DirectionalLight(0xfff2d6, 2.2);
  private readonly bg = new Color(0x2a2a2a);

  constructor(
    private readonly scene: Scene,
    size = 256,
  ) {
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.radius = 3;
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
    this.apply();
  }

  focus(x:number,z:number):void {
    const dx=x-this.sun.target.position.x,dz=z-this.sun.target.position.z;
    this.sun.target.position.set(x,0,z);this.sun.position.x+=dx;this.sun.position.z+=dz;
    const c=this.sun.shadow.camera;c.left=c.bottom=-70;c.right=c.top=70;c.updateProjectionMatrix();this.sun.target.updateMatrixWorld();
  }

  setHour(hour: number): void {
    this.hour = wrap24(hour);
    this.apply();
  }

  setPlaying(on: boolean): void {
    this.playing = on;
    this.last = 0;
  }

  setDaySeconds(n: number): void {
    this.daySeconds = Math.min(600, Math.max(20, n));
  }

  tick(now: number): void {
    if (this.playing) {
      const prev = this.last || now;
      this.hour = wrap24(this.hour + ((now - prev) / 1000 / this.daySeconds) * 24);
    }
    this.last = now;
    this.apply();
  }

  snapshot(): SkyState {
    return {
      hour: this.hour,
      playing: this.playing,
      daySeconds: this.daySeconds,
      label: periodOf(this.hour),
    };
  }

  /** Place the key light on a solar arc; below the horizon it becomes a low moon so shadows stay. */
  private apply(): void {
    const look = sample(this.hour);
    this.sun.color.copy(look.sun);
    this.sun.intensity = look.sunI;
    const daylight = Math.min(1, Math.max(0, Math.sin((this.hour - 6) / 12 * Math.PI) * 3));
    this.ambient.color.copy(look.amb).lerp(new Color(0xe1e5d6),.12 + .38 * daylight);
    this.ambient.intensity = 1.05 - .30 * daylight;
    this.hemi.color.copy(look.hemi).lerp(new Color(0xd5e5ed),.35);
    this.hemi.groundColor.copy(look.ground).lerp(new Color(0xa49a87),.15 + .4 * daylight);
    this.hemi.intensity = .85 + .2 * daylight;
    this.bg.copy(look.bg);
    this.scene.background = this.bg;


    const elev = elevation(this.hour);
    const moon = elev < 4 * DEG;
    const e = moon ? MOON : elev;
    const az = azimuth(this.hour);
    const r = this.size * 0.85;
    const cx = this.sun.target.position.x;
    const cz = this.sun.target.position.z;
    this.sun.position.set(cx + r * Math.cos(e) * Math.sin(az), r * Math.sin(e), cz + r * Math.cos(e) * Math.cos(az));
    this.sun.target.updateMatrixWorld();
  }
}

function elevation(hour: number): number {
  return Math.sin(((hour - 6) / 12) * Math.PI) * PEAK;
}

/** 06:00 east (+X), 18:00 west (−X). Offset so the iso camera still reads the shadow. */
function azimuth(hour: number): number {
  return ((hour - 6) / 12) * Math.PI + 28 * DEG;
}

function sample(hour: number): {
  sun: Color;
  sunI: number;
  amb: Color;
  ambI: number;
  hemi: Color;
  ground: Color;
  bg: Color;
  paint: Color;
} {
  const h = wrap24(hour);
  let i = 0;
  while (i < STOPS.length - 1 && STOPS[i + 1]!.hour <= h) i += 1;
  const lo = STOPS[i]!;
  const hi = STOPS[i + 1] ?? STOPS[0]!;
  const span = hi.hour - lo.hour || 1;
  const t = smooth((h - lo.hour) / span);
  return {
    sun: mix(lo.sun, hi.sun, t),
    sunI: lo.sunI + (hi.sunI - lo.sunI) * t,
    amb: mix(lo.amb, hi.amb, t),
    ambI: lo.ambI + (hi.ambI - lo.ambI) * t,
    hemi: mix(lo.hemi, hi.hemi, t),
    ground: mix(lo.ground, hi.ground, t),
    bg: mix(lo.bg, hi.bg, t),
    paint: mix(lo.paint, hi.paint, t),
  };
}

function mix(a: number, b: number, t: number): Color {
  return new Color(a).lerp(new Color(b), t);
}

function smooth(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function wrap24(hour: number): number {
  return ((hour % 24) + 24) % 24;
}

export function periodOf(hour: number): string {
  const h = wrap24(hour);
  if (h >= 5 && h < 7) return "Dawn";
  if (h >= 7 && h < 11) return "Morning";
  if (h >= 11 && h < 15) return "Noon";
  if (h >= 15 && h < 17.5) return "Afternoon";
  if (h >= 17.5 && h < 20) return "Dusk";
  return "Night";
}

export function formatHour(hour: number): string {
  const h = wrap24(hour);
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
