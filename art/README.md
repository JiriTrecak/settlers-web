# Editable art

- `assets/<asset-id>/asset.json`: working definitions and role-named resources.
- `sources/`: editable Blender files, model recipes and original image masters.
- `styles/`: approved art direction and image-reference collections.
- `profiles/`: export and validation settings.
- `recipes/`: reproducible environment generation scripts.

Runtime resources live in `assets/library/` at the repository root. Publish through the asset editor or shared authoring service; see [publication](../docs/asset-pipeline/publication.md) and [Asset Studio](../docs/asset-pipeline/studio.md).

Keep source inputs and generation provenance. Put temporary comparisons, screenshots and delivery reports in ignored `tmp/`, not a permanent proof archive. Legacy icon masters are retained in `sources/interface/icons/`; these are unique full-resolution source images, not copies of the small runtime icons.
