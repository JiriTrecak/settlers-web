import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { AnimationMixer, LoopOnce, LoopRepeat } from 'three';

const ONE_SHOT = new Set(['attack', 'cast', 'hit', 'death']);
/** Shared by the studio and game. Call update(dt) with seconds from the game clock. */
export class CharacterPlayer {
  constructor(root, clips, variant = 'base') {
    this.root = root;
    this.mixer = new AnimationMixer(root);
    this.actions = new Map(clips.map(clip => [clip.name, this.mixer.clipAction(clip)]));
    root.traverse(o => { if (o.userData.characterProfile) this.profile = o.userData.characterProfile; });
    if (!this.profile?.variants) throw new Error('Character asset is missing its animation profile');
    this.variant = variant; this.state = null; this.paused = false; this.speed = 1.5;
    this.onEvent = null; this.eventFired = false;
    this.mixer.addEventListener('finished', e => {
      if (e.action === this.action && this.state !== 'death') this.setState('idle');
    });
    this.setVariant(variant); this.setState('idle');
  }
  setVariant(variant) {
    if (!Object.hasOwn(this.profile.variants, variant)) throw new Error(`Unknown character variant: ${variant}`);
    this.variant = variant;
    this.root.traverse(o => { if (o.userData.role) o.visible = o.userData.role === 'base' || o.userData.role === variant; });
    if (this.state) this.setState(this.profile.variants[variant].states[this.state] ? this.state : 'idle', {restart:true});
  }
  setState(state, { restart = false, fade = .12 } = {}) {
    if (this.state === state && !restart) return;
    const name = this.profile.variants[this.variant].states[state];
    const next = this.actions.get(name);
    if (!next) throw new Error(`Animation state unavailable: ${state} (${name})`);
    const previous = this.action;
    this.state = state; this.action = next; this.eventFired = false;
    next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1);
    next.setLoop(ONE_SHOT.has(state) ? LoopOnce : LoopRepeat, ONE_SHOT.has(state) ? 1 : Infinity);
    next.clampWhenFinished = ONE_SHOT.has(state);
    next.play();
    if (previous && previous !== next) { previous.fadeOut(fade); next.fadeIn(fade); }
  }
  update(dt) {
    if (!Number.isFinite(dt) || dt < 0) throw new Error('Animation delta must be finite nonnegative seconds');
    if (this.paused) return;
    const attack = this.state === 'attack', action = this.action;
    const event = this.profile.attackEvents[this.variant];
    // Evaluate the crossing before mixer.finished changes state, including a long frame.
    const crossed = attack && event && !this.eventFired && action.time + dt * this.speed >= action.getClip().duration * event.normalizedTime;
    if (crossed) { this.eventFired = true; this.onEvent?.({ type: event.event, variant: this.variant }); }
    this.mixer.update(dt * this.speed);
  }
  attackContact() { return this.profile.attackEvents[this.variant]?.normalizedTime ?? .55; }
  seek(normalized) {
    if (!this.action) return;
    for (const action of this.actions.values()) if (action !== this.action) action.stop();
    this.action.stopFading(); this.action.setEffectiveWeight(1);
    this.action.time = Math.max(0, Math.min(.999999, normalized)) * this.action.getClip().duration;
    this.action.paused = false; this.mixer.update(0);
  }
  setTeamColor(color) {
    this.root.traverse(o => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (m.name !== 'TC_TeamColor') continue;
        m.userData.defaultTeamColor ??= m.color.clone();
        if (color === 'default') m.color.copy(m.userData.defaultTeamColor); else m.color.set(color);
      }
    });
  }
  dispose() { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.root); }
}

/** Geometry is shared; skeletons and materials are independent between units/players. */
export function createCharacterInstance(gltf, variant = 'base') {
  const root = clone(gltf.scene), materials = new Map();
  root.traverse(o => {
    if (!o.isMesh) return;
    const own = m => { if (!materials.has(m)) materials.set(m, m.clone()); return materials.get(m); };
    o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material);
  });
  const player = new CharacterPlayer(root, gltf.animations, variant);
  return { root, player, dispose() { player.dispose(); const skeletons = new Set(); root.traverse(o => { if (o.isSkinnedMesh) skeletons.add(o.skeleton); }); for (const skeleton of skeletons) skeleton.dispose(); for (const m of materials.values()) m.dispose(); root.removeFromParent(); } };
}
