Editor free-cam is orthographic and can orbit. Default play view is north-up perspective: 56° downward pitch, zero yaw in our Y-up/+Z-south coordinates. Default distance is calculated from 32 building cells (128 world units) of horizontal coverage at 16:9. A five-cell hall occupies roughly 16% of the ground-plane viewport width. Zoom spans 60 world units (closest) to the distance for 40 cells of coverage (farthest), with a closer fit on small maps. The full viewport is clamped inside the map, including after resizing; terrain clearance is included in the bounds. `rev` tracks camera mutations.

Framing: classic RTS angle of attack (56° below the horizontal) with north-up orientation. The reference lens is an authored 70° FOV converted to a vertical FOV of `70 / sqrt(1 + aspect²)`, about 34.32° at 16:9. Horizontal coverage is preserved in narrow editor panes. The view is calibrated by visible battlefield coverage, not pixel-identical framing.

The minimap projects the same camera's four ground corners: a horizontal trapezoid in play, the actual orthographic footprint in free/top view. It does not rotate or approximate the outline independently.

RTS terrain following preserves at least four units above terrain beneath the eye and twelve above water. Close-up unit cameras bypass these RTS clearances and the ground-footprint clamp. Their world-space eye and aim come from the rendered unit transform and declared asset anchor, so raised floors retain their actual height. Near plane is 0.08 and far plane 180. First-person FOV defaults to 68°, third-person to 55°. Pose transitions interpolate position, rotation and lens; returning to RTS restores the saved focus without changing zoom.

`unitCamera.ts` computes first/third-person poses. The renderer constrains the third-person boom against nearby scenery, observed buildings and terrain, then applies the pose. Session owns the local mode and resolves authored mission Script IDs. `firstPersonBody.ts` suppresses color and depth writes only for the viewed body, preserving shadow passes and restoring shared materials after each draw.

Third-person follow aims 10° upward from the original trailing view (about 7° below horizontal at a seven-unit boom distance). The offset is `THIRD_PERSON_LOOK_UP` in `unitCamera.ts`; explicit actor look-at shots keep their aim.

`viewGround` uses bounded forward projections for near-horizontal rays rather than intersections behind the camera or infinite minimap polygons. Close views ignore RTS edge/arrow panning and zoom; use the command button or Escape to return. Wheel momentum retains its existing 140 ms settling behavior in RTS.

See `docs/expansion/unit-camera-modes.md` for authoring, behavior and known limits.
