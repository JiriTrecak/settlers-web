Editor free-cam is orthographic and can orbit. Default play view is perspective: 32° vertical FOV at 16:9, 45° pitch, -45° yaw, distance 40, wheel range 20–60. It pans within the map plus half a block. `rev` tracks camera mutations.

RTS terrain following preserves at least four units above terrain beneath the eye and twelve above water. Close-up unit cameras bypass these RTS clearances and the ground-footprint clamp. Their world-space eye and aim come from the rendered unit transform and declared asset anchor, so raised floors retain their actual height. Near plane is 0.08 and far plane 180. First-person FOV defaults to 68°, third-person to 55°. Pose transitions interpolate position, rotation and lens; returning to RTS restores the saved focus without changing zoom.

`unitCamera.ts` computes first/third-person poses. The renderer constrains the third-person boom against nearby scenery, observed buildings and terrain, then applies the pose. Session owns the local mode and resolves authored mission Script IDs. `firstPersonBody.ts` suppresses color and depth writes only for the viewed body, preserving shadow passes and restoring shared materials after each draw.

`viewGround` uses bounded forward projections for near-horizontal rays rather than intersections behind the camera or infinite minimap polygons. Close views ignore RTS edge/arrow panning and zoom; use the command button or Escape to return. Wheel momentum retains its existing 140 ms settling behavior in RTS.

See `docs/expansion/unit-camera-modes.md` for authoring, behavior and known limits.
