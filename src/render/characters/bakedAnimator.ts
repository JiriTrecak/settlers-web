/**
 * CharacterPlayer's state machine without a mixer, for baked crowds. It owns clip clocks only;
 * the GPU poses the unit from `frames()`. Semantics follow three's mixer as CharacterPlayer uses
 * it: semantic aliases keep gait phase, one-shots clamp and return to idle, a new state fades in
 * linearly while the outgoing one fades out from its current weight, `sample()` locks the
 * current clip to authority while fades keep running.
 *
 * The shader blends three poses (current + two fading). A fourth concurrent fade drops the
 * lightest; weights are normalised where the mixer would mix in the rest pose.
 */
import type { AssetDefinition } from "../../shared/authoring/asset";
import { BAKE_FPS, type BakedClip, type CharacterBake } from "./animationBake";
import { characterProfile, oneShotState, type AntState, type CharacterProfile } from "./character-player.js";
import type { AnimationClip, Object3D } from "three";

type Track = { clip: BakedClip; time: number; once: boolean };
type Fading = { track: Track; from: number; elapsed: number; duration: number };

/** The player surface the settlement layer drives; CharacterPlayer satisfies it too. */
export interface UnitAnimator {
  readonly state: AntState;
  readonly variant: string;
  paused: boolean;
  hold: boolean;
  speed: number;
  holding(): boolean;
  hasState(state: AntState): boolean;
  setState(state: AntState, options?: { restart?: boolean; fade?: number }): void;
  update(dt: number): void;
  sample(normalized: number, dt: number): void;
  attackContact(): number;
  clipDuration(): number;
  phase(): number;
  speak(amount: number): void;
}

type Definitions = NonNullable<AssetDefinition["capabilities"]>["animations"] | undefined;
/** Fade weights travel quantised to 1/1023 inside one float (exact below 2²⁴). */
const WEIGHT_STEPS = 1023;

export class BakedAnimator implements UnitAnimator {
  state: AntState = "idle";
  paused = false;
  /** Baked poses cost nothing to hold back; accepted for interface parity. */
  hold = false;
  speed = 1.5;
  private current!: Track;
  private fadeIn: { elapsed: number; duration: number } | null = null;
  private fading: Fading[] = [];
  private readonly states: Record<string, string>;

  constructor(
    private readonly bake: Pick<CharacterBake, "clips">,
    private readonly profile: CharacterProfile,
    private readonly definitions: Definitions,
    readonly variant: string,
  ) {
    if (!Object.hasOwn(profile.variants, variant)) throw new Error(`Unknown character variant: ${variant}`);
    this.states = profile.variants[variant]!.states;
    this.start(this.hasState("idle") ? "idle" : (Object.keys(this.states)[0] as AntState));
  }

  static create(bake: CharacterBake, root: Object3D, clips: readonly AnimationClip[], variant: string, capabilities?: AssetDefinition["capabilities"]) {
    const { profile, definitions } = characterProfile(root, clips, variant, capabilities);
    return new BakedAnimator(bake, profile, definitions, variant);
  }

  holding() { return false; }
  hasState(state: AntState) { return this.bake.clips.has(this.states[state]!); }

  setState(state: AntState, { restart = false, fade = 0.18 }: { restart?: boolean; fade?: number } = {}) {
    if (this.state === state && !restart) return;
    const clip = this.clip(state), previous = this.current;
    this.state = state;
    // Semantic aliases (run/charge) share one clip: preserve its gait phase.
    if (previous.clip === clip && !restart) return;
    // Re-entering a clip that is still fading out restarts that same action, as in the mixer.
    this.fading = this.fading.filter((f) => f.track.clip !== clip);
    if (previous.clip !== clip && fade > 0) {
      this.fading.push({ track: previous, from: this.currentWeight(), elapsed: 0, duration: fade });
      this.fadeIn = { elapsed: 0, duration: fade };
    } else this.fadeIn = null;
    this.current = { clip, time: 0, once: oneShotState(this.definitions, state) };
  }

  update(dt: number) {
    if (!Number.isFinite(dt) || dt < 0) throw new Error("Animation delta must be finite nonnegative seconds");
    if (this.paused) return;
    const step = dt * this.speed;
    this.advanceFades(step);
    if (this.advance(this.current, step) && this.state !== "death" && this.hasState("idle")) this.setState("idle");
  }

  sample(normalized: number, dt: number) {
    if (!Number.isFinite(dt) || dt < 0) throw new Error("Animation delta must be finite nonnegative seconds");
    if (this.paused) return;
    this.current.time = Math.max(0, Math.min(0.999999, normalized)) * this.current.clip.duration;
    this.advanceFades(dt * this.speed);
  }

  attackContact() { return this.profile.attackEvents?.[this.variant]?.normalizedTime ?? 0.55; }
  clipDuration() { return this.current.clip.duration; }
  phase() { return this.current.time / this.current.clip.duration; }
  /** Baked rigs have no speech bones (bakeCharacter rejects them). */
  speak() {}

  /** Normalised poses, current first, then the two heaviest fades. */
  blend(): Array<{ clip: string; time: number; weight: number }> {
    const poses = [{ track: this.current, weight: this.currentWeight() }, ...this.fading.map((f) => ({ track: f.track, weight: f.from * (1 - f.elapsed / f.duration) }))];
    const kept = [poses[0]!, ...poses.slice(1).sort((a, b) => b.weight - a.weight).slice(0, 2)];
    const total = kept.reduce((sum, p) => sum + p.weight, 0) || 1;
    return kept.map((p) => ({ clip: p.track.clip.name, time: p.track.time, weight: p.weight / total }));
  }

  /** Writes (current frame, fade frame, fade frame, packed fade weights) for the vertex shader. */
  frames(out: Float32Array, offset: number) {
    const a = this.position(this.current);
    out[offset] = out[offset + 1] = out[offset + 2] = a;
    out[offset + 3] = 0;
    if (!this.fading.length) return;
    const poses = this.fading.map((f) => ({ f, weight: f.from * (1 - f.elapsed / f.duration) })).sort((x, y) => y.weight - x.weight).slice(0, 2);
    const total = this.currentWeight() + poses.reduce((sum, p) => sum + p.weight, 0) || 1;
    const q = (w: number) => Math.round(Math.min(1, Math.max(0, w / total)) * WEIGHT_STEPS);
    out[offset + 1] = this.position(poses[0]!.f.track);
    out[offset + 2] = poses[1] ? this.position(poses[1].f.track) : a;
    out[offset + 3] = q(poses[0]!.weight) + (poses[1] ? q(poses[1].weight) : 0) * (WEIGHT_STEPS + 1);
  }

  private clip(state: AntState) {
    const clip = this.bake.clips.get(this.states[state]!);
    if (!clip) throw new Error(`Animation state unavailable: ${state} (${this.states[state]})`);
    return clip;
  }

  private start(state: AntState) {
    this.state = state;
    this.current = { clip: this.clip(state), time: 0, once: oneShotState(this.definitions, state) };
  }

  private currentWeight() {
    return this.fadeIn ? Math.min(1, this.fadeIn.elapsed / this.fadeIn.duration) : 1;
  }

  private position(track: Track) {
    return track.clip.start + Math.min(track.clip.frames - 1, track.time * BAKE_FPS);
  }

  /** True when a one-shot reached its end this step (the mixer's `finished`). */
  private advance(track: Track, step: number) {
    const duration = track.clip.duration;
    if (track.once) {
      if (track.time >= duration) return false;
      track.time += step;
      if (track.time < duration) return false;
      track.time = duration;
      return true;
    }
    track.time = duration > 0 ? (track.time + step) % duration : 0;
    return false;
  }

  private advanceFades(step: number) {
    if (this.fadeIn && (this.fadeIn.elapsed += step) >= this.fadeIn.duration) this.fadeIn = null;
    for (const f of this.fading) { this.advance(f.track, step); f.elapsed += step; }
    this.fading = this.fading.filter((f) => f.elapsed < f.duration);
  }
}
