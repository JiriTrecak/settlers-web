# Minimap

Canvas2D, north-up overview with actual map-scaled building footprints (quarter-turn rotation and a one-pixel minimum). Amber mines are yellow at their declared footprint; exhausted deposits and contained units are omitted. Player units use bright faction markers. Editor spawn badges remain editor-only.

The cached background combines authored terrain paint, grass-cover palettes, water and directional elevation shading. Scenery is a faint one-pixel dark accent, so trees cannot overwhelm terrain or ownership colors. Terrain is rerasterized only when height or landscape changes.

Observed entities are drawn over the fog layer, including dimmed remembered structures. No hidden authoritative enemy data is accessed. Dragging pans the camera and the white quadrilateral shows its ground footprint. Game and editor share this module.
