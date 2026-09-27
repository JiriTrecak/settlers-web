# Ant Worker

Tripo H3.1 model based on the supplied worker reference, adapted in Blender and bound to the existing `unit.ants.settler` definition. The editable source retains the original 18 segmented parts, rig, full-resolution packed textures and motion takes. `source.glb` is the unmodified provider export with deliberately packed UVs.

The runtime worker is 4,072 triangles including its fitted ivory/timber hatchet. The largest carried bundle is 100 triangles, giving 4,172 for the complete unit. Body textures are reduced to 2K only during export. Leaf ownership is stored in albedo alpha; the material remains opaque and the chitin, eyes, backpack and tool retain their natural colors.

Motion states include idle, walk/run, stationary carrying, carrying walk/run, chopping, generated construction work, hit and death. The hand tool follows the right hand; the backpack and hard head/eyes have corrected rigid weights. Cargo attaches to the exported `socket_back`, with imported rig scale and rest orientation compensated by the renderer.

Validated: published GLB parity, complete triangle budget, normalized skin weights, finite nonempty motion tracks, texture size and ownership isolation; front/reference render and blue team in the 3D studio; chopping/construction poses; actual amber gathering and backpack carry between deposit and hall in Combat Lab. Normal Threewater gathering and tier-two economy/recruitment integration are verified. Campaign civilians reuse this model through an explicit alias. This asset has no facial speech rig.

Rebuild using the studio: `node experiments/building-studio/launch.mjs serve ant-worker-tripo --category characters --port 8779`. Use its build action so rendering/export is serialized. `prepare_texture.py` regenerates the ownership atlas; `model.py` regenerates the editable source and runtime rig; `cargo.py` creates the small carried bundles. Publish with `node --import tsx scripts/assets/publish-tripo-unit.ts ant-worker-tripo`.
