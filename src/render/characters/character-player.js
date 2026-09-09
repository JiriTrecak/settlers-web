import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { AnimationMixer, LoopOnce, LoopRepeat } from 'three';

const ATTACK = { base: 'attack_unarmed', warrior: 'attack_sword', archer: 'attack_bow' };
const ONE_SHOT = new Set(['attack', 'hit', 'death']);
/** Shared by the studio and game. Call update(dt) with seconds from the game clock. */
export class CharacterPlayer {
  constructor(root, clips, variant = 'base') {
    this.root = root;
    this.mixer = new AnimationMixer(root);
    this.actions = new Map(clips.map(clip => [clip.name, this.mixer.clipAction(clip)]));
    this.variant = variant; this.state = null; this.paused = false; this.speed = 1.5;
    this.onEvent = null; this.eventFired = false;
    this.mixer.addEventListener('finished', e => {
      if (e.action === this.action && this.state !== 'death') this.setState('idle');
    });
    this.setVariant(variant); this.setState('idle');
  }
  setVariant(variant) {
    if (!(variant in ATTACK)) throw new Error(`Unknown character variant: ${variant}`);
    this.variant = variant;
    this.root.traverse(o => { if (o.userData.role) o.visible = o.userData.role === 'base' || o.userData.role === variant; });
    if (['build', 'chop'].includes(this.state) && variant !== 'base') this.setState('idle');
    if (this.state === 'attack') this.setState('attack', { restart: true });
  }
  setState(state, { restart = false, fade = .12 } = {}) {
    if (this.state === state && !restart) return;
    if (['build', 'chop'].includes(state) && this.variant !== 'base') throw new Error('Work actions require the base worker variant');
    const name = state === 'attack' ? ATTACK[this.variant] : state;
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
    const threshold = this.variant === 'archer' ? .65 : .55;
    // Evaluate the crossing before mixer.finished changes state, including a long frame.
    const crossed = attack && !this.eventFired && action.time + dt * this.speed >= action.getClip().duration * threshold;
    if (crossed) { this.eventFired = true; this.onEvent?.({ type: this.variant === 'archer' ? 'release' : 'hit', variant: this.variant }); }
    this.mixer.update(dt * this.speed);
  }
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
