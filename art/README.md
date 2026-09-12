# Authoring sources

- `records/<asset-id>/asset.json`: checked asset identities, exports and source/provenance links.
- `sources/`: editable Blender documents, recipes, pack sources and local comparison studios.
- `styles/`: curated reference collections and art direction.
- `profiles/`: checked export/validation policies.
- `references/`: scene comparison images.
- `migrations/`: retained physical-path ledger.
- `archive/`: historical outputs and generators. No runtime fallback resolves from here.

Generate/import/publish images through Asset Studio, at `http://127.0.0.1:5175/`. The same server supports `npm run assets:studio` for agents. See `docs/asset-pipeline/studio.md`.

Historical generators may contain old output paths. They are preserved as reference recipes, not supported entry points. New 3D generation/publication will use a separate provider adapter; existing Blender source previews remain usable.
