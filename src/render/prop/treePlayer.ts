import { AnimationMixer, LoopOnce, type AnimationAction, type AnimationClip, type Object3D } from 'three';
import type { Entity } from '../../sim/game/state';

type Felling = NonNullable<NonNullable<Entity['resource']>['felling']>;
/** A sampled visual clock: never emits gameplay damage or resources. Nodes are instance-owned. */
export class TreePlayer {
  readonly mixer: AnimationMixer;
  private readonly actions: Map<string, AnimationAction>;
  private action: AnimationAction | undefined;
  state: 'hit' | 'fall' | 'decay' | 'gone' = 'hit';
  constructor(readonly root: Object3D, clips: readonly AnimationClip[]) {
    this.mixer = new AnimationMixer(root);
    this.actions = new Map(clips.map(c => [c.name, this.mixer.clipAction(c)]));
    for (const name of ['hit', 'fall', 'decay'])
      if (!this.actions.has(name)) throw new Error(`Tree is missing ${name} animation`);
  }
  sample(felling: Felling, tick: number, fallTicks: number, decayTicks: number): boolean {
    let name: 'hit' | 'fall' | 'decay' = 'hit';
    let elapsed = Math.max(0, tick - (felling.lastHitTick ?? tick));
    if (felling.fallTick !== null) {
      elapsed = Math.max(0, tick - felling.fallTick);
      if (elapsed >= fallTicks + decayTicks) {
        this.state = 'gone'; this.root.visible = false; return false;
      }
      if (elapsed >= fallTicks) { name = 'decay'; elapsed -= fallTicks; }
      else name = 'fall';
    }
    this.state = name; this.root.visible = true;
    const action = this.actions.get(name)!;
    if (this.action !== action) {
      this.mixer.stopAllAction();
      action.reset().setEffectiveTimeScale(1).setEffectiveWeight(1);
      action.setLoop(LoopOnce, 1); action.clampWhenFinished = true; action.play();
      this.action = action;
    }
    // Game ticks are 25 ms. Sample at 1x, independent of ant playback's 1.5x default.
    action.time = Math.min(action.getClip().duration, elapsed / 40);
    action.paused = false;
    this.mixer.update(0);
    return true;
  }
  dispose() { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.root); }
}
