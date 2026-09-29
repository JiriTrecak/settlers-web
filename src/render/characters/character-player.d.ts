import type {AssetDefinition} from '../../shared/authoring/asset';
import type { Object3D, AnimationClip, AnimationAction, AnimationMixer, ColorRepresentation } from 'three';
export type AntVariant = string;
export type AntState = 'idle' | 'walk' | 'run' | 'charge' | 'build' | 'chop' | 'carry' | 'carry_walk' | 'carry_run' | 'attack' | 'cast' | 'hit' | 'death';
export class CharacterPlayer {
  constructor(root: Object3D, clips: AnimationClip[], variant?: AntVariant, capabilities?:AssetDefinition['capabilities']);
  root: Object3D; mixer: AnimationMixer; variant: AntVariant; state: AntState;
  action: AnimationAction; paused: boolean; speed: number;
  /** Defer posing this frame; banked time applies on the next posed frame. */
  hold: boolean;
  holding(): boolean;
  onEvent: ((event: {type: 'hit' | 'release'; variant: AntVariant}) => void) | null;
  setVariant(variant: AntVariant): void;
  hasState(state: AntState): boolean;
  setState(state: AntState, options?: {restart?: boolean; fade?: number}): void;
  update(dt: number): void;
  attackContact(): number;
  clipDuration(): number;
  phase(): number;
  sample(normalized: number, dt: number): void;
  seek(normalized: number): void;
  speak(amount:number): void;
  setTeamColor(color: ColorRepresentation | 'default'): void;
  dispose(): void;
}

export type CharacterProfile = {variants: Record<string, {states: Record<string, string>}>; attackEvents?: Record<string, {event: 'hit' | 'release'; normalizedTime: number} | undefined>};
export function characterProfile(root: Object3D, clips: readonly AnimationClip[], variant: AntVariant, capabilities?: AssetDefinition['capabilities']): {profile: CharacterProfile; definitions: NonNullable<AssetDefinition['capabilities']>['animations'] | undefined};
export function oneShotState(definitions: NonNullable<AssetDefinition['capabilities']>['animations'] | undefined, state: string): boolean;
export function createCharacterInstance(gltf: {scene: Object3D; animations: AnimationClip[]}, variant?: AntVariant, capabilities?:AssetDefinition['capabilities']): {root: Object3D; player: CharacterPlayer; dispose(): void};
