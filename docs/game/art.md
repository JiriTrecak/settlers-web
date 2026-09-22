# Art direction

Under the Canopy is a readable stylized RTS about forest-floor warfare: chunky upright ants, acorn shields, heavy wooden weapons, stick construction and structural leaf roofs. Use the [approved settlement concept](../../art/styles/forest-settlement.png) for the faction's visual direction; current unit/building coverage still includes deliberate missing-model placeholders.

The environment uses original woodland assets: simple layered pine silhouettes, broad painted color areas, subdued green foliage, warm earth, natural pebble trails and stick/root bridges. Avoid high-frequency needle detail, washed-out trees and oversaturated greens. Autumn uses dry grasses and warm leaves; frozen woodland uses its own biome materials.

Ownership must read at RTS zoom. Put team color on substantial armor and architectural surfaces, using the [team-color material contract](../declarations/team-color.md). Keep decorative litter smaller and visually quieter than harvestable trees and interactive resources. Large trunks and canopy shade establish insect scale without hiding units.

Geometry, materials, light and ground-cover density work together. Review assets in the actual renderer on a representative map, at gameplay distance as well as close up. Changes to a texture should not silently change tree geometry or branch arrangement.

Retain approved source art and editable models in `art/`; put temporary renders and comparisons in ignored `tmp/`. See [publication](../asset-pipeline/publication.md) for the asset contract.
