import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createCharacterInstance } from '../../src/render/characters/character-player.js';
import { Mesh, MeshStandardMaterial, SkinnedMesh } from 'three';

async function asset() {
  const bytes = readFileSync('experiments/assets/characters/ant-family/model.glb');
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}
function team(root: import('three').Object3D) {
  let found: MeshStandardMaterial | undefined;
  root.traverse(o => { if (o instanceof Mesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m.name === 'TC_TeamColor') found = m as MeshStandardMaterial; });
  return found!;
}

describe('exported ant character runtime', () => {
  it('has one shared rig, real animation clips and all equipment roles', async () => {
    const gltf = await asset(); const roles = new Set<string>(); let skinned = 0;
    gltf.scene.traverse(o => { if (o.userData.role) roles.add(o.userData.role); if (o instanceof SkinnedMesh) skinned++; });
    expect([...roles].sort()).toEqual(['archer','base','warrior']); expect(skinned).toBeGreaterThan(0);
    expect(gltf.animations.map(a => a.name)).toEqual(expect.arrayContaining(['idle','walk','run','attack_sword','attack_bow','carry','hit','death']));
  });
  it('keeps skeletons and team materials independent and changes bone transforms', async () => {
    const gltf = await asset(), a = createCharacterInstance(gltf), b = createCharacterInstance(gltf);
    const bone = a.root.getObjectByName('thighL')!; expect(bone).toBeTruthy();
    const initial = bone.quaternion.clone(); a.player.setState('walk'); a.player.update(.25);
    expect(bone.quaternion.angleTo(initial)).toBeGreaterThan(.1);
    expect(b.root.getObjectByName('thighL')!.quaternion.angleTo(initial)).toBeLessThan(.001);
    a.player.setTeamColor('#2244ff'); expect(team(a.root).color.equals(team(b.root).color)).toBe(false);
    a.dispose(); b.dispose();
  });
  it('routes attack by role, emits once across a long frame, and returns to idle', async () => {
    const c = createCharacterInstance(await asset(), 'archer'); const events: string[] = [];
    c.player.onEvent = e => events.push(e.type); c.player.setState('attack');
    expect(c.player.action.getClip().name).toBe('attack_bow');
    c.player.update(3); c.player.update(3); expect(events).toEqual(['release']); expect(c.player.state).toBe('idle');
    c.player.setVariant('warrior'); c.player.setState('attack'); expect(c.player.action.getClip().name).toBe('attack_sword');
    c.player.update(2); expect(events).toEqual(['release','hit']); c.dispose();
  });
  it('loops army running independently from settler walking', async () => {
    const c = createCharacterInstance(await asset(), 'warrior');
    c.player.setState('run'); const clip = c.player.action.getClip();
    expect(clip.name).toBe('run');
    c.player.update(clip.duration * 3);
    expect(c.player.state).toBe('run'); expect(c.player.action.isRunning()).toBe(true);
    c.player.setState('walk'); expect(c.player.action.getClip().name).toBe('walk');
    c.dispose();
  });
  it('switches worker tools with looping build and chop actions', async () => {
    const c = createCharacterInstance(await asset(), 'base');
    const hammer=c.root.getObjectByName('tool_hammer')!, axe=c.root.getObjectByName('tool_axe')!;
    expect(hammer).toBeTruthy(); expect(axe).toBeTruthy();
    c.player.setState('build'); c.player.seek(.56);
    expect(hammer.scale.x).toBeCloseTo(1); expect(axe.scale.x).toBeLessThan(.01);
    c.player.update(2); expect(c.player.state).toBe('build');
    c.player.setState('chop'); c.player.seek(.56);
    expect(axe.scale.x).toBeCloseTo(1); expect(hammer.scale.x).toBeLessThan(.01);
    c.player.setState('walk'); c.player.seek(.2);
    expect(hammer.scale.x).toBeLessThan(.01); expect(axe.scale.x).toBeLessThan(.01);
    c.player.setVariant('warrior'); expect(()=>c.player.setState('build')).toThrow();
    c.dispose();
  });
  it('pauses, scrubs without firing gameplay events, and clamps death', async () => {
    const c = createCharacterInstance(await asset()); c.player.setState('walk');
    c.player.update(.1); expect(c.player.action.time).toBeCloseTo(.15);
    c.player.setState('walk', { restart: true }); c.player.paused = true;
    c.player.update(.25); expect(c.player.action.time).toBe(0); c.player.seek(.5); expect(c.player.action.time).toBeGreaterThan(.4);
    c.player.paused = false; c.player.setState('death'); c.player.update(3); expect(c.player.state).toBe('death'); expect(c.player.action.paused).toBe(true); c.dispose();
  });
});
