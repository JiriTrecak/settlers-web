import type { Object3D, AnimationClip, AnimationAction, AnimationMixer, ColorRepresentation } from 'three';
export type AntVariant = string;
export type AntState = 'idle' | 'walk' | 'run' | 'build' | 'chop' | 'carry' | 'attack' | 'cast' | 'hit' | 'death';
export class CharacterPlayer {
  constructor(root: Object3D, clips: AnimationClip[], variant?: AntVariant);
  root: Object3D; mixer: AnimationMixer; variant: AntVariant; state: AntState;
  action: AnimationAction; paused: boolean; speed: number;
  onEvent: ((event: {type: 'hit' | 'release'; variant: AntVariant}) => void) | null;
  setVariant(variant: AntVariant): void;
  setState(state: AntState, options?: {restart?: boolean; fade?: number}): void;
  update(dt: number): void;
  seek(normalized: number): void;
  setTeamColor(color: ColorRepresentation | 'default'): void;
  dispose(): void;
}

export function createCharacterInstance(gltf: {scene: Object3D; animations: AnimationClip[]}, variant?: AntVariant): {root: Object3D; player: CharacterPlayer; dispose(): void};
