# Original woodland pine texture studies

- v1: detailed individual needle texture (rejected: too detailed and green).
- v2: single muted branch (replaced: too uniform).
- Current: six-clump, low-detail grey-olive atlas in `art/sources/environment/woodland-pine-a/albedo.png`, shared by pine A, pine B, and sapling.
- `scouring-reference/image-1.png` is the supplied comparison reference, not a runtime texture for these original pines.

Current atlas generated with built-in ImageGen from the reference as a style guide: six separate varied bough silhouettes, almost no needle detail, soft matte shading, dark desaturated grey olive, only slightly brighter than the source. Transparent 3-column / 2-row atlas. Deterministic per-branch UV selection and mirroring in `art/recipes/woodland_originals.py`. Geometry and bark unchanged.

## Dark-green atlas refinement
Built-in ImageGen edit: preserve six silhouettes and transparent grid, dark forest-green pigment with broad shadow/mid-green/moss-green patches, almost no needle detail or visible twig lines. Left column deepest green; middle medium; right moss-green. A favors darker cells, B lighter cells. Exposed radial branches removed from all three models.

## Branch-end depth refinement
Built-in ImageGen edit, preserving the six-clump layout, silhouettes, palette and low-detail painting. Prompt: substantially deepen broad green shadows at the outermost 20–30% of terminal and lateral branch ends, blending into existing lighter interior patches; retain soft transitions, no outlined edges, needles or new geometry. Current atlas is albedo.png in each original pine source folder. Previous green atlas retained as needles-v4-green-atlas.png.

## Clean atlas reset
Re-generated with built-in ImageGen using only the supplied original Scouring atlas as a style reference. Prompt emphasizes almost featureless interiors, only two or three broad soft dark olive-green regions per clump, no bright strokes, needle clusters, chevrons, veins or fine interior patterns; varied silhouettes in a transparent 3x2 atlas. Previous high-contrast detail version rejected and archived. Geometry, lighting and UV assignment kept unchanged for a controlled comparison.
