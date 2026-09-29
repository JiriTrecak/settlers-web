import { describe, expect, it } from "vitest";
import {
  AnimationClip,
  AnimationMixer,
  Bone,
  BoxGeometry,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  QuaternionKeyframeTrack,
  Skeleton,
  SkinnedMesh,
  Vector3,
  VectorKeyframeTrack,
} from "three";
import { BAKE_FPS, bakeCharacter, bakedSlotAt, bakedSocketAt } from "../../src/render/characters/animationBake";
import { BakedAnimator } from "../../src/render/characters/bakedAnimator";

/** Two-bone arm under a transformed pivot, root off-origin: exercises every term of the bake. */
function rig() {
  const root = new Group();
  root.position.set(1, 0, 2);
  root.rotation.y = 0.3;
  const pivot = new Group();
  pivot.position.set(0, 0.5, 0);
  pivot.rotation.x = 0.2;
  root.add(pivot);
  const hip = new Bone(), arm = new Bone(), socket = new Object3D();
  hip.name = "Hip"; arm.name = "Arm"; socket.name = "socket_tip";
  arm.position.set(0, 1, 0);
  socket.position.set(0, 0.8, 0.1);
  hip.add(arm); arm.add(socket);
  const geometry = new BoxGeometry(0.5, 2, 0.5, 1, 4, 1).translate(0, 1, 0);
  const n = geometry.attributes.position!.count, index: number[] = [], weight: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = Math.min(1, Math.max(0, geometry.attributes.position!.getY(i) / 2));
    index.push(0, 1, 0, 0);
    weight.push(1 - t, t, 0, 0);
  }
  geometry.setAttribute("skinIndex", new Float32BufferAttribute(index, 4));
  geometry.setAttribute("skinWeight", new Float32BufferAttribute(weight, 4));
  const mesh = new SkinnedMesh(geometry, new MeshStandardMaterial());
  mesh.position.set(0.2, 0, 0);
  pivot.add(hip, mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new Skeleton([hip, arm]));
  const q = (angle: number) => new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), angle).toArray();
  const wave = new AnimationClip("wave", 1, [
    new QuaternionKeyframeTrack("Arm.quaternion", [0, 0.5, 1], [...q(0), ...q(1.2), ...q(0)]),
    new VectorKeyframeTrack("Hip.position", [0, 1], [0, 0, 0, 0.3, 0.1, 0]),
  ]);
  const idle = new AnimationClip("idle", 2, [new QuaternionKeyframeTrack("Arm.quaternion", [0, 2], [...q(0), ...q(0.4)])]);
  return { root, mesh, socket, clips: [idle, wave] };
}

describe("animation bake", () => {
  it("skins vertices and sockets exactly like three's SkinnedMesh", () => {
    const { root, mesh, socket, clips } = rig();
    const bake = bakeCharacter(root, clips, "base")!;
    expect(bake).not.toBeNull();
    const clip = bake.clips.get("wave")!, mixer = new AnimationMixer(root);
    mixer.clipAction(clips[1]!).play();
    const rootInverse = new Matrix4(), slot = new Matrix4(), baked = new Vector3(), live = new Vector3(), socketRows = new Float32Array(12);
    const index = mesh.geometry.attributes.skinIndex!, weight = mesh.geometry.attributes.skinWeight!, position = mesh.geometry.attributes.position!;
    for (const f of [0, 7, 15, 22]) {
      mixer.setTime(f / BAKE_FPS);
      root.updateMatrixWorld(true);
      rootInverse.copy(root.matrixWorld).invert();
      for (let v = 0; v < position.count; v++) {
        live.fromBufferAttribute(position, v);
        mesh.applyBoneTransform(v, live).applyMatrix4(mesh.matrixWorld).applyMatrix4(rootInverse);
        baked.set(0, 0, 0);
        for (let k = 0; k < 4; k++) {
          const w = weight.getComponent(v, k);
          if (w) baked.addScaledVector(new Vector3().fromBufferAttribute(position, v).applyMatrix4(bakedSlotAt(bake, clip.start + f, index.getComponent(v, k), slot)), w);
        }
        expect(baked.distanceTo(live)).toBeLessThan(1e-4);
      }
      bakedSocketAt(bake.sockets.get("socket_tip")!, clip.start + f, socketRows);
      const expected = new Matrix4().multiplyMatrices(rootInverse, socket.matrixWorld).elements;
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) expect(socketRows[r * 4 + c]).toBeCloseTo(expected[c * 4 + r]!, 5);
    }
    bake.dispose();
  });

  it("leaves rigs it cannot reproduce on the live path", () => {
    const { root, clips } = rig();
    root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()));
    expect(bakeCharacter(root, clips, "base")).toBeNull();
  });
});

/** Same fixture as character-transitions.test.ts: each clip's pose is one number. */
function animator() {
  const value: Record<string, number> = { idle: 0, walk: 2, run: 4, attack: 10 };
  const clips = new Map(Object.keys(value).map((name, i) => [name, { name, start: i * 40, frames: BAKE_FPS + 1, duration: 1 }]));
  const player = new BakedAnimator({ clips }, { variants: { base: { states: { idle: "idle", walk: "walk", run: "run", charge: "run", attack: "attack" } } }, attackEvents: { base: { normalizedTime: 0.55, event: "hit" } } }, undefined, "base");
  player.speed = 1;
  player.setState("run");
  player.update(0.2);
  const pose = () => player.blend().reduce((sum, p) => sum + value[p.clip]! * p.weight, 0);
  return { player, pose };
}

describe("baked animation transitions", () => {
  it("blends into an authoritative attack while retaining its exact contact time", () => {
    const { player, pose } = animator();
    expect(pose()).toBeCloseTo(4);
    player.setState("attack"); player.sample(0.2, 0); expect(pose()).toBeCloseTo(4);
    player.sample(0.3, 0.09); expect(pose()).toBeGreaterThan(4); expect(pose()).toBeLessThan(10); expect(player.phase()).toBeCloseTo(0.3);
    player.sample(0.55, 0.1); expect(pose()).toBeCloseTo(10); expect(player.phase()).toBeCloseTo(0.55);
    player.setState("idle"); player.update(0); expect(pose()).toBeCloseTo(10);
    player.update(0.09); expect(pose()).toBeGreaterThan(0); expect(pose()).toBeLessThan(10);
    player.update(0.1); expect(pose()).toBeCloseTo(0);
  });

  it("retains gait phase for aliases", () => {
    const { player } = animator();
    const phase = player.phase();
    player.setState("charge");
    expect(player.phase()).toBe(phase);
  });

  it("does not jump when another state interrupts an unfinished blend", () => {
    const { player, pose } = animator();
    player.setState("attack"); player.sample(0.1, 0.06);
    const before = pose();
    player.setState("walk"); player.update(0); expect(pose()).toBeCloseTo(before);
    player.update(0.3); expect(pose()).toBeCloseTo(2);
  });

  it("returns a finished one-shot to idle and packs fade weights for the shader", () => {
    const { player } = animator();
    player.setState("attack");
    player.update(0.09);
    const frames = new Float32Array(4);
    player.frames(frames, 0);
    const low = frames[3]! % 1024, fade = low / 1023, blend = player.blend();
    expect(fade).toBeCloseTo(blend[1]!.weight, 2);
    // Outgoing run (clip start 80) kept its clock: .2 s before the switch plus .09 s of fade.
    expect(frames[1]).toBeCloseTo(80 + 0.29 * BAKE_FPS, 3);
    player.update(1);
    expect(player.state).toBe("idle");
  });
});
