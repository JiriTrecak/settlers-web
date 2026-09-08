# Moss surface

`moss-surface.png` is an original texture generated with the built-in OpenAI
imagegen tool on 2026-09-08. It is sampled in world coordinates on the Forest
Meadow's actual leaf geometry, never on a scene backdrop or ground plane.
The original output is preserved without cropping or image manipulation.

Source: `/Users/jiritrecak/.codex/generated_images/01a07a71-505e-7761-808a-5a1a189bfc6a/exec-d3e96870-8be5-46bf-9c32-a6f87d5de7fe.png`.

Final prompt:

> Use case: stylized-concept. Asset type: seamless square albedo texture for low forest ground-cover meshes in an insect-scale fantasy RTS. Create one production-ready tile, top-down orthographic, edge-to-edge dense tiny curled moss fronds and miniature overlapping forest leaves, very fine texture with readable leaf folds at several scales. Warcraft-like stylized painted 3D material, natural and tactile, not photoreal photography, not childish. Predominantly olive green, muted yellow-green tips, warm brown-green recesses, restrained saturation. Uniform soft diffuse illumination, subtle local contact shading only, no directional cast shadows, no glossy highlights, no vignette, no perspective. Dense carpet with many hundreds of small leaves and moss filaments, irregular natural clusters and fine dark interstices. No rocks, flowers, twigs, tree trunks, buildings, paths or exposed soil. No text, border or labels. The tile should repeat seamlessly in both directions. This will be sampled on actual 3D foliage, not used as a scene background. Square 1024x1024.

The tool returned 1254×1254. Repeat wrapping and mipmaps are used. Visual check
at the reference camera: `tmp/ant-colony/pass-33.png`. The full requested scene
match remains unfinished.
