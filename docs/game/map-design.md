# Competitive map design

How to author a skirmish map that is fair, rewards skill and is worth watching. Distilled from Warcraft III
melee mapping practice (Blizzard's *Creating Competitive Multiplayer Melee Maps*, Hive Workshop guides by
Filmting and mafe, Blizzard's Reforged *Melee Map Tips*), then adapted to Under the Canopy's rules. The big
change: **Root is the contested objective** — it plays the role WC3 gives to the central Tavern and
contested mines. Authoring mechanics (layers, masks, the editor MCP) live in the `author-canopy-map` skill;
this document is *what* to build.

Every number below is checked by the map's test (`tests/game/<slug>-map.test.ts`), not by eye.

## 1. Goals

- **Fair from every start.** Each player sees the same map: same distances, same resources, same camps.
- **Skill over luck.** Expanding, creeping routes, contesting Root and map control decide games — not a lucky drop.
- **Readable and watchable.** Several routes, recognisable landmarks, a contested centre.

## 2. Size, symmetry, distances

| Players | Size | Symmetry |
|---|---|---|
| 2 (1v1) | 256 | point (180°) |
| 4 (2v2 / FFA) | 512 | rotational (90°) about the centre |

- Author one player's share, generate the rest by symmetry. **Never hand-place a mirrored feature.**
- Rotation keeps every player's view identical; with 4 players each start has two neighbours and one opposite.
- Path lengths (A*, not straight lines) from each start to: every other start, its own mines, the nearest Root,
  the centre — equal across players within 3%.
- Oversized maps feel empty: if the closest enemy is more than ~2 minutes of army walk away, shrink.

## 3. Routes and terrain

- **Trees do not block movement** in our sim; only water, steep terrain and large objects (mega scenery,
  buildings) do. Woods shape *sight lines and art*, water/terrain/landmarks shape *pathing*.
- **Multiple routes** to every important point (base, natural, Root). No single corridor that one building can wall.
- Chokes and high ground are tools: ramps and bridges at least 6 cells wide; a river gets ≥ 2 crossings per
  player share.
- Keep **lanes** — the natural walking lines between starts — as open ground. Camps stay off them (§6).
- **Forest is the default.** Fill the map with wood and cut bases, lanes, pockets and trails out of it; a
  map built from a few wood blobs on open ground reads as empty.
- Because trees don't block, open ground gives straight routes, and lanes cut along them read as a grid.
  Bend the real routes with water and blocking landmarks (a lake at each shared edge, a pond on each
  diagonal), cut lanes as ragged gaps along the resulting routes, and pinch them with small tree islands
  off the walking line. No roads along lanes.
- **Hidden trails** are narrow dead-end spurs from a lane into pockets (camps, deposits, landmarks). Never
  chain them into a second ring around the map.

## 4. Starts and bases

- Flat shelf ≥ 21 cells radius at the hall (flatten layer), forest cut ≥ 26 cells, full base fits (test places
  the complete building roster).
- **Equal first-tree distance**: pines (harvestable) within the starting gather radius (40) of every hall,
  at the same distance for every player — groves just outside the base cut.
- Main amber mine 25–35 cells from the hall, unguarded, with its entrance facing the hall.
- Base camps (green) sit > aggro + leash + 10 cells from any hall so they never leash into a base.
- Do not make trees the only wall of a base (they don't block anyway) and don't leave pathing gaps in cliffs.

## 5. Resources

**Amber** (gold): 12,000 per deposit (content default).

- Main: 1 per player, unguarded.
- **Natural**: 1 per player, clearly closer to its owner than to anyone else (ratio ≥ 2:1), 60–90 cells from
  the hall, guarded by a **medium** camp — takeable early, never free.
- Further expansions: harder guards the closer they are to the centre. Never two easy naturals beside one start.

**Wood**: pines are the harvest wood; plenty in every share for a long game. Oaks are accents.

**Root** (contested, *our modification*): 3,000 per deposit, 5 shared harvesters, delivered only to a
Rootworks built within 12 cells. Tier 2 (Great Mound: 100 Root), Bombardiers and research need it, so Root
sites are where armies meet.

- **No Root inside a base.** Tier 2 must cost map control.
- **Shared Root** between neighbours (4 players: on the edge midpoint between two starts; 2 players: the
  sides) — equidistant from both, guarded by a **medium** camp. This is each player's realistic first Root.
- **Mid Root** (4 players) — about halfway from a base to the centre, inside the wood between two
  neighbours, reached only by trails and guarded by a **hard** camp. Each player has one leaning toward them.
- **Central Root cluster** — the Tavern-equivalent — equidistant from all starts, guarded by **hard** camps.
  More deposits than shared sites, so the late game converges on the centre.
- Every Root keeps a flat, buildable ring of ≥ 16 cells (room for a Rootworks within 12) reachable by ≥ 2
  routes, so one building cannot wall it off. Think about the Root *delivery route* — it is the raid target.
- Total Root on the map ≥ 3 × (players × 100) so every player can reach Tier 2 even when losing the centre.

## 6. Creeps

Tier bands by **total camp level** (sum of member levels), mirroring WC3's green/orange/red:

| Tier | Composition | Total level | Loot pool | Placement |
|---|---|---|---|---|
| Green | small | 3–9 | `loot.camp.easy` (T1) | near each main: the first creep route |
| Orange | medium | 10–19 | `loot.camp.medium` (≤ T2) | naturals, shared Root, expansions |
| Red | hard | 20+ | `loot.camp.hard` (≤ T2) / `legendary` (T3) | centre Root, contested ground |

- Per player share (1v1 reference ~3 green, 4 orange, 1 red; bigger maps scale up): at least 3 green,
  one orange guarding the natural, one at the shared Root, and a share of the central reds.
- **Tucked away**: camps sit in forest openings beside landmarks and mines, never on a lane. Every member
  stays > aggro range + 3 cells from the walking routes between starts (tested). Walking across the map must
  not pull anything.
- Mine and Root guards stand between the lane and the deposit's entrance so taking the site means fighting.
- Mixed roles (melee + ranged/caster); 2–6 members. No level-6+ creeps in green or orange camps (heroes can't
  realistically take them early) — our compositions already follow this.
- Use the editor's camp stamp (`editor_entities action=camp`, or the entity dock's *camp* category); themes
  fit landmarks (Bog Toads by water, Mushroom Circle by giant mushrooms, Rotwood Court at corrupted roots).
- Items: the strongest creep carries the best roll. At most **3 T3** items per map from camps
  (`legendary: true` + `loot.camp.legendary`; the map parser enforces it), so 4-player maps, which need
  four symmetric copies, carry none. High-profile camps there are the hard Rotwood Court and Hollow Stag.
- Density (4 players, 512): about 12 camps per share — 6 green, 4 orange, 2 red (Heartroot Glade: 48).

## 7. Neutral buildings

We have no taverns or shops yet; the central Root cluster is the contested mid. When shops arrive: one
unguarded central (Tavern role), others placed symmetrically, and only 2–3 kinds per map.

## 8. Process

1. Lock size, player count, biome.
2. Place starts; measure start-to-start paths before anything else.
3. Place mains, naturals, Root (shared and central); then lanes are known.
4. Place camps off the lanes, guards on mines/Root; then woods and water around them.
5. Landmarks and decoration last; they must not change pathing near lanes, members or deposits.
6. Validate with the map test (distances, build space, reachability, lane clearance, tier counts) and
   editor screenshots at game distance. Play AI matches from every start.
7. Iterate — don't fall in love with the first layout.
