Editor free-cam is orthographic and can orbit. Default play view is north-up perspective: 56° downward pitch, zero yaw in our Y-up/+Z-south coordinates. Its horizontal coverage is 32 building cells at 16:9; distance derives from that coverage and the lens. Zoom spans 52 world units to 1.5× the default distance, with a closer fit on small maps. The full viewport is clamped inside the map, including after resizing; terrain clearance is included in the bounds. `rev` tracks camera mutations.

Warcraft reference: [Blizzard.j camera constants](https://github.com/nestharus/JASS-Definitions/blob/master/Blizzard.j) specify angle of attack 304°, rotation 90° and authored FOV 70°. Coordinate conversion gives our 56° pitch and north-up orientation. The [original projection investigation](https://www.hiveworkshop.com/threads/making-an-accurate-get-mouse-screen-position.350018/) reports vertical FOV `70 / sqrt(1 + aspect²)`, about 34.32° for the classic 16:9 world viewport. We use that reference lens, preserving horizontal coverage in narrow editor panes. Our full-canvas HUD layout differs from Warcraft's inset viewport; this is not a claim of pixel-identical framing across game versions.

The minimap projects the same camera's four ground corners: a horizontal trapezoid in play, the actual orthographic footprint in free/top view. It does not rotate or approximate the outline independently.

RTS terrain following preserves at least four units above terrain beneath the eye and twelve above water. Close-up unit cameras bypass these RTS clearances and the ground-footprint clamp. Their world-space eye and aim come from the rendered unit transform and declared asset anchor, so raised floors retain their actual height. Near plane is 0.08 and far plane 180. First-person FOV defaults to 68°, third-person to 55°. Pose transitions interpolate position, rotation and lens; returning to RTS restores the saved focus without changing zoom.

`unitCamera.ts` computes first/third-person poses. The renderer constrains the third-person boom against nearby scenery, observed buildings and terrain, then applies the pose. Session owns the local mode and resolves authored mission Script IDs. `firstPersonBody.ts` suppresses color and depth writes only for the viewed body, preserving shadow passes and restoring shared materials after each draw.

Third-person follow aims 10° upward from the original trailing view (about 7° below horizontal at a seven-unit boom distance). The offset is `THIRD_PERSON_LOOK_UP` in `unitCamera.ts`; explicit actor look-at shots keep their aim.

`viewGround` uses bounded forward projections for near-horizontal rays rather than intersections behind the camera or infinite minimap polygons. Close views ignore RTS edge/arrow panning and zoom; use the command button or Escape to return. Wheel momentum retains its existing 140 ms settling behavior in RTS.

See `docs/expansion/unit-camera-modes.md` for authoring, behavior and known limits.
