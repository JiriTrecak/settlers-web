# Original surface atlas

Generated with the built-in imagegen tool on 2026-09-08, using the approved
Ant colony and ground close-ups as style references. Runtime asset:
`surface-atlas.png`. Four equally sized quadrants: timber (top left), red shell
(top right), stone (bottom left), and dry soil (bottom right).

The shader samples quadrant UVs directly. This supplies surface detail to real
geometry; it is not used as a scene background. Source output remains in the
Codex generated-images directory.

## Generation prompt

Use case: stylized-concept. Asset type: production game material-detail atlas, not concept art or a scene. Generate one square 2048x2048 image divided EXACTLY into four equal edge-to-edge square quadrants, no gutters, no labels, no border. Top-left: warm weathered oak timber surface, fine directional grain running vertically, gentle knots, shallow splits, polished worn fibers, no separate planks or plank seams. Top-right: deep rust-red ant carapace / painted shell surface, subtle worn scratches, small shallow chips, warm orange-red mottling, no armor plates, no metal bands or bolts. Bottom-left: gray-tan weathered stone surface, fine mineral variation and tiny irregular pits, no masonry seams. Bottom-right: warm ochre dry forest soil, granular clods, sparse tiny pale grit and shallow broken irregular fissures, no grass, moss or large rocks. Match the attached Ant colony reference's sophisticated hand-painted stylized RTS material feel and earthy palette. Each quadrant should have even flat diffuse illumination, no directional shadows, no highlights baked in, no perspective. Fine natural detail with restrained tonal contrast; these are albedo detail textures applied to actual modeled surfaces. Use the attached images only for material/color reference. Do not depict buildings, trees, ants, tools, any scene, text or UI. Each quadrant should be visually repeatable as a texture without obvious large features.
