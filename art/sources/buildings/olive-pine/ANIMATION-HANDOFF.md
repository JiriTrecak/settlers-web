# Olive pine harvesting animations

## Runtime asset

Load `assets/ant-colony/olive-pine-animated.glb`. Companion contract: `assets/ant-colony/olive-pine-animated.animation.json`.
The existing static pine is unchanged. This export has 1,568 triangles, two meshes and shared vertex-colored material; no skeleton or textures. Each tree needs independent animated node transforms and its own AnimationMixer. Geometry/materials may remain shared.

## Clips and triggers

- `hit` — **0.60 s**: small damped crown/trunk recoil; stump stays anchored. Trigger on actual axe contact, not at the start of the settler's swing. Ends upright; repeat/restart for subsequent strikes.
- `fall` — **1.80 s**: brief hold, accelerating ground-rooted fall, contact around **1.25 s**, then a grounded hold without bounce. Trigger on the final blow; interrupt any hit clip. Ignore subsequent hit requests. Ground-impact timing is metadata, not an embedded glTF event.
- `decay` — **6.00 s**: starts exactly at the fall's final pose. Holds for 0.75 s, then the full-size fallen crown slides vertically below ground. Stump sinks during 4.50–6.00 s. Hide/remove the instance at completion (all geometry is below the local ground plane).

Use **1× speed**, seconds-based delta, `LoopOnce`, weight 1, and `clampWhenFinished = true`. No idle clip is needed. Stop previous actions and start the next within the same tick; do not blend via an upright idle. The terminal fall pose matches the initial decay pose. You may delay decay while holding the clamped fall pose. No material opacity/shader animation is required.

```js
const clips = Object.fromEntries(gltf.animations.map(c => [c.name, c]));
const tree = gltf.scene.clone(true); // independent nodes, shared geometry/material
const mixer = new THREE.AnimationMixer(tree);
let state = 'standing';
function play(name) {
  mixer.stopAllAction();
  const action = mixer.clipAction(clips[name]);
  action.reset().setEffectiveWeight(1).setEffectiveTimeScale(1);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  return action;
}
function onAxeContact(finalBlow) {
  if (state === 'falling' || state === 'decaying' || state === 'gone') return;
  if (finalBlow) { state = 'falling'; play('fall'); }
  else { state = 'hit'; play('hit'); }
}
mixer.addEventListener('finished', ({action}) => {
  const name = action.getClip().name;
  if (name === 'hit') { state = 'standing'; action.stop(); }
  if (name === 'fall') { state = 'decaying'; play('decay'); }
  if (name === 'decay') {
    state = 'gone'; tree.visible = false;
    // Queue cleanup after the current mixer.update() returns.
  }
});
// Each frame, while this tree is active: mixer.update(deltaSeconds).
// Deferred cleanup: mixer.stopAllAction(); mixer.uncacheRoot(tree);
// Remove wrapper from scene. Do not dispose shared materials/geometry.
```

## Placement, direction, and integration

GLB uses **Y up**; ground origin is the base, upright height approximately **6.38 units**, cut pivot **0.65 units** above ground. Match existing tree scale/position. Default fall direction is **local +Z**. Rotate an outer placement wrapper around Y using `Math.atan2(direction.x, direction.z)` before falling; keep that heading stable during fall/decay. Apply scale to the outer wrapper. Do not manually overwrite the animated `FallPivot` or `StumpPivot` transforms.

For large forests, retain existing static/instanced trees. Swap only an actively harvested tree to an animated proxy at the same placement, removing/hiding its static instance to avoid duplicates. Release the proxy after disappearance. This export does not automatically animate InstancedMesh instances.

Simulation remains authoritative for wood, HP, collision and selection state; avoid awarding resources from visual animation completion. Fire optional impact sound/dust when the fall action crosses 1.25 s, once per fall. No particles, sound, resource logic, or gameplay integration were added.

## Source and validation

Editable source: `olive-pine-animated.blend`. Original static source is preserved. In Blender, unmute the matching NLA track on both FallPivot and StumpPivot; other tracks must remain muted. Source runs at 30 fps; each clip starts at frame 1.

Regenerate intentionally with background Blender running `animate.py`, then `node pack-animation.mjs` from this directory (or use project-relative paths). This recreates the animated source from the approved static `pine-game.glb`; it overwrites manual animated-source edits. `validate-animation.mjs` checks the actual exported GLB with Three.js at 120 Hz. The generic static viewer exporter must not flatten this animated hierarchy.

Checks passed: saved Blender finite geometry/indices, black world/camera/packed reference; GLB loading, clip timings, finite transforms, ground-level trunk/tip at fall end, monotonic downward pivot movement, hit rest return, fall→decay continuity, all vertices below ground at decay completion, unchanged full scale throughout decay. Browser playback and final poses visually inspected. Disappearance uses downward translation at full scale, requiring opaque terrain to hide submerged geometry; the fallen trunk centerline and tip reach Y=0, intentionally allowing foliage below the ground plane. Terrain beyond a flat local ground plane is not handled by these clips.
