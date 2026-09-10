---
title: First combat balance baseline
description: Implemented initial HP, damage, armor, hero and ten-resource-load economy baseline.
---

# First combat balance baseline

::: tip Implemented initial version — 9 September 2026
Revision 3 implements the reviewed combat direction and the ten-resource-per-trip economy scale. The current roster, hero table, armor rules and abilities below are in the game. T2/T3 remain future design targets. These are first-playtest values, not a claim of established competitive balance. Generated encyclopedia pages describe the current declarations.
:::

## Objective

The chosen direction is **Warcraft-strength heroes, numerous inexpensive early troops, and a large power increase into tier three**. Heroes keep roughly Warcraft's individual durability, sustained damage, spell impact and level progression. The colony's worker-to-soldier conversion remains the economic identity.

This revision supersedes the earlier 420-HP, 18-damage Warrior and 31-second mirror-fight target. The reference for “30% weaker” is a comparable **Warcraft unit**, not our broken prototype or the first draft's numbers.

### What “30% weaker and cheaper” means

For an initial mathematical baseline, use **70% effective HP, 70% sustained DPS, and 70% normalized resource cost** for tier-one combat units relative to their role reference. Preserve comparable armor and attack interval initially; scale HP and damage per hit. Round sensibly for the game and document exceptions.

```text
Equal resource budget buys: 1 / 0.70 = 1.429 × as many units
Total effective HP:          1.429 × 0.70 = 1.00 × reference
Total sustained DPS:         1.429 × 0.70 = 1.00 × reference
```

This matches aggregate health and damage budgets, **not guaranteed combat outcomes**. Overkill, collision, melee contact, focus fire, area spells and player control all change how effectively more bodies fight. A useful rough per-unit strength index is `sqrt(effective HP × DPS)`: scaling both inputs to 70% scales this index to 70%, although their unnormalized product becomes 49%. There is no universal linear “power” stat.

A hero consequently feels stronger against one tier-one soldier without artificially increasing the hero's stats. The baseline also preserves roughly Warcraft-like single-unit mirror duration, rather than independently imposing the previous faster mirror target. More affordable troops and larger fights determine the eventual pace.

### Prices and the worker bottleneck

The **30% discount is a design requirement**. It applies to tier-one combat-unit resource prices after normalizing the reference economy; raw Warcraft gold amounts cannot be copied into our amber economy. A reference troop with resource-cost index 100 gets index 70 here. For two-resource prices, apply the same factor to both components before final integer rounding.

The **ten-resource load** now sets the denomination: use Warcraft-sized prices instead of an inferred compact-currency exchange rate. The classic Footman costs 135 gold; 70% is 94.5, rounded to **95 amber** for a Warrior. The classic Rifleman costs 205 gold/30 lumber; 70% is 143.5/21, rounded to **145 amber/20 wood** for an Archer. These roundings are deliberate first-pass exceptions. [Footman](https://classic.battle.net/war3/human/units/footman.shtml), [Rifleman](https://classic.battle.net/war3/human/units/rifleman.shtml).

A full gathering cycle produces ten, capped by source remainder and reserved load space. Amber work is **2.5 seconds per load**, lumber **10 seconds per load**, plus travel. This balance measurement used trees holding 100 wood; the subsequent animated-harvesting pass changes each tree to 10 wood and 10 axe hits, followed by a 1.8-second fall. See the [current economy](/guide/economy). Starting funds are **500 amber/150 wood**. Barracks cost 160/60; house 80/20; forester 120/80; Sanctuary 180/50; non-attacking Watchtower 30/20. Building work times and free repair remain unchanged. The starting Hall is still not offered as an expansion purchase.

This aligns resource denominations, **not exact Warcraft income per minute**. A three-minute Mosswater probe with the starting three miners and two woodcutters delivered **290 amber and 180 wood**. Minute-to-minute deliveries were 100/60, 90/50 and 100/70; travel and contention matter. Reproduce with `node --import tsx scripts/probe-balance-income.ts`. The old four-resource probe is superseded. Watch whether the new prices make available workers or delivered amber the limiting factor before further adjustments.

Every recruit still costs **one worker**. Assigned economic workers stay protected. If births, spare workers or recruitment travel constrain production, cheaper amber/wood will not produce 43% more soldiers. The Hall currently supplies five births/minute and each house three, while below worker capacity; the absolute eight-worker Hall and three-worker house capacities are separate constraints. Do not spend the economic workforce automatically to fake the target army size.

For equal-budget army comparisons, explicitly test both a full reserve and an exhausted reserve. If reserves bind, tune housing investment, birth throughput or available-worker capacity as a separate measured decision. No birth-rate increase is implied by this proposal yet.

## Problems in the pre-balance prototype

The previous content fingerprint `43f7e716` exposed four concrete mismatches:

1. **A basic area spell erases basic units.** Faultline rank one deals 75 before armor: enough to kill a full-health 70-HP Archer or 60-HP Worker. Rank three deals 163 after a Warrior's two armor, exceeding its entire 120 HP.
2. **Flat armor breaks low-damage attacks.** The level-ten Marshal has 13 armor. A Warrior's 12-damage attack falls to the one-damage minimum. Against an idle, unequipped Marshal, one Warrior needs about 852 seconds of sustained damage to remove 1,065 HP, ignoring regeneration and spells.
3. **Armor classes currently do nothing.** Every physical matchup multiplier is 100%. The Light, Heavy and Building icons describe no counter relationship.
4. **Hero support and mana are oversized.** Rally rank one adds eight damage to a Warrior's twelve, a 67% raw increase; rank three adds 22, a 183% increase. The Marshal regenerates four mana/second, versus approximately 0.76 for the reference level-one Mountain King without bonuses.

Local evidence: `content/game.json`; `src/sim/game/combat.ts` (damage resolution); `src/sim/game/stats.ts` (level/item growth); `src/sim/game/spellcasting.ts` (mana). Tick duration is 25 ms. The Mountain King comparison uses [its Intelligence](https://classic.battle.net/war3/human/units/mountainking.shtml) and [Blizzard's mana formula](https://classic.battle.net/war3/basics/heroes.shtml).

## 1. Replace flat armor with percentage armor

Use Warcraft's `1 / (1 + 0.06 × armor)` multiplier for nonnegative armor. Apply the declared attack-versus-armor-class multiplier, then armor points for ordinary attacks, then temporary damage reduction. Round once to the nearest whole HP at final damage application. An explicit zero multiplier remains immunity; do not turn it into the one-damage minimum.

Spell damage uses its own matchup row and bypasses armor points. Temporary protection can still reduce it. This prevents armor from becoming both universal spell resistance and near-immunity to small attacks.

Use one authoritative damage calculation for attacks, spells, previews and AI estimates. JSON supplies balance constants and matchup values; the native system owns execution. If negative armor is introduced, define and test that branch explicitly rather than extrapolating the positive curve through its singularity.

### Small matchup table for our current roster

These are **our implemented multipliers**, not a copy of Warcraft's full table. Our existing **Light** class describes workers and lightly armored ground units; it is not Warcraft's mostly-air Light class.

| Attack class | Light | Heavy | Hero | Building | Armor points apply? |
| --- | ---: | ---: | ---: | ---: | --- |
| Melee | 150% | 100% | 100% | 70% | Yes |
| Piercing | 75% | 90% | 50% | 35% | Yes |
| Hero attack | 100% | 100% | 100% | 50% | Yes |
| Spell | 100% | 100% | 70% | 25% | No |

Melee punishes exposed Archers; ranged troops can concentrate fire but are inefficient against buildings. The Hero class offers some protection from arrows and spells while remaining vulnerable to a surround. Building spell resistance prevents area nukes from becoming the best siege weapon. Offensive stuns affect units, not buildings.

No new siege unit or magic-attacking troop is required for this pass. Add those rows when their units exist. Piercing versus Heavy takes inspiration from the [documented 90% Warcraft change](https://us.forums.blizzard.com/en/warcraft3/t/warcraft-iii-reforged-patch-notes-version-204/36567); our ground Light class now follows the relevant Warcraft Medium matchups. Hero resistance to Piercing returns to Warcraft's 50%; building spell damage remains our separate 25% choice.

## 2. Starting units and the tier curve

All values are unupgraded and unequipped. The existing-roster values are implemented declarations; future tiers below are design candidates. Preserve movement speeds, ranges and collision sizes for existing units initially. For combat references, the [Footman](https://classic.battle.net/war3/human/units/footman.shtml) supplies the melee baseline and the [classic Rifleman](https://classic.battle.net/war3/human/units/rifleman.shtml) is an explicit provisional ranged reference. The latter is not a claim that every bow unit must have a Rifleman's role.

| Unit | Candidate HP | Armor / class | Damage | Attack interval | Basis |
| --- | ---: | --- | ---: | ---: | --- |
| Worker | 240 | 0 / Light | No attack | — | Economic-unit baseline; no automatic combat discount |
| Warrior, T1 | **300** | 2 / Heavy | **9** | **1.35 s** | Footman 420 HP / 12.5 damage × 0.70, rounded |
| Archer, T1 | **375** | 0 / Light | **15** | **1.50 s** | Classic Rifleman 535 HP / 21 damage × 0.70, rounded |
| Marshal, level 1 | **700** | 2 / Hero | **31** | **1.825 s** | Mountain King-scale hero; level table below |
| Wolf | 300 | 0 / Light | 14 | 1.20 s | Unchanged encounter candidate from the first draft |
| Ogre | 900 | 4 / Heavy | 38 | 1.60 s | Unchanged encounter candidate |
| Thornspitter | 400 | 1 / Light | 20 | 1.60 s | Unchanged encounter candidate |
| Elder Thornspitter | 1,000 | 3 / Heavy | 36 | 1.70 s | Unchanged encounter candidate |

Warriors, Wolves and Ogres use Melee; Archers and both Thornspitters use Piercing; the Marshal uses Hero attack. The Archer has more raw HP than the Warrior in this Rifleman-derived candidate, but worse armor and vulnerability to melee. If we instead choose a lighter scout-archer role, give it a different explicit reference and rebalance its price; do not quietly treat the earlier 320-HP candidate as an exact 70% Rifleman.

The rounded Warrior has about 71% of the Footman's HP and 72% of its DPS, which is close to the intended 70% package. The exact unrounded anchor is **294 HP / 8.75 damage**. The Archer's anchor is **374.5 HP / 14.7 damage**. Its 1.50-second interval deliberately belongs to the classic benchmark, not the modern 1.4-second Rifleman patch.

### Advanced troops should look and feel advanced

The 30% reduction is **not applied to every tier**. These bands describe future roles; they do not add units to the current roster.

| Tier | Role and presence | Indicative HP | Indicative damage / interval | Indicative armor | Resource-cost scale |
| --- | --- | --- | --- | --- | --- |
| T1 | Numerous early infantry and ranged support | 300–375 | 9–15 / 1.35–1.50 s | 0–2 | 70% of normalized W3 role reference |
| T2 | Specialists, improved frontline, meaningful counters | 500–750 | 18–28 / 1.35–1.70 s | 2–4 | Roughly 2–3 T1 purchases, adjusted for utility |
| T3 | Large elite troops, heavy armor, visibly forceful attacks | 1,000–1,400 | 36–55 / 1.40–2.00 s | 4–7 | Roughly 4–6 T1 purchases plus tech investment |

These are design bands, not a cross-product from which every maximum can be chosen for one cheap unit. A concrete illustrative T3 brute might have **1,200 HP, six armor, and 42 damage every 1.6 seconds**. It is a different investment from a disposable early soldier, with a larger silhouette and potentially more demanding pathing. No blanket 30% discount is promised for T3.

A late elite can rival or surpass a low-level hero in raw physical combat. The developed hero retains spells, items and leadership. Basic units keep uses through price, availability, screening, scouting and specialist counters; existing T1 units do not silently turn into T3 bodies when technology advances. Future upgrades may improve T1 without erasing the tier gap.

**One worker becomes much more valuable when converted into an elite.** Keep the one-worker identity, but make resources, technology and eventually the planned contested third resource pay for that efficiency. Higher recruitment/arming time is also a possible T3 lever. Otherwise late-game worker scarcity makes “only build the strongest unit” the obvious answer regardless of nominal amber efficiency.

## 3. Building durability

| Building | Current → proposed HP | Proposed armor |
| --- | ---: | ---: |
| Main Hall | 1,000 → **1,800** | **5** |
| Barracks | 450 → **1,200** | **5** |
| Worker house | 250 → **600** | **3** |
| Forester lodge | 250 → **750** | **3** |
| Amber Sanctuary | 500 → **1,000** | **5** |
| Watchtower | 350 → **500** | **2** |
| Neutral Amber Mine | 1,500 → **1,500** | **5** |

All use Building armor. This gives the player time to react while leaving houses and support buildings attractive raid targets. The Hall and Watchtower retain their current non-attacking roles.

Retain **free repair, one worker per building, ten HP/second** initially. Those are the actual current rules in `src/sim/game/economy.ts`: it creates only one repair job per target. Recheck throughput if multiple repair workers are added later.

Completed-building HP is not the only pressure valve. Current construction starts at 10% HP and a Barracks takes six seconds of work. Test forward construction and replacement spam before calling the whole economy balanced; combat HP tuning does not validate current prices or build times.

## 4. Marshal growth through level ten

Use the classic Mountain King's stat progression as the first **hero-strength anchor**, then assess the Marshal's different ability kit and encounters. This is approximate equivalence, not a promise of equal matchup win rates. The earlier draft's faster basic attacks and flatter mana pool are superseded.

| Level | HP | Damage | Armor | Mana | Attack interval | HP / mana regeneration per second |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 700 | 31 | 2 | 225 | 1.825 s | 1.45 / 0.76 |
| 2 | 775 | 34 | 3 | 240 | 1.800 s | 1.60 / 0.81 |
| 3 | 850 | 37 | 3 | 270 | 1.725 s | 1.75 / 0.91 |
| 4 | 925 | 40 | 4 | 285 | 1.700 s | 1.90 / 0.96 |
| 5 | 1,000 | 43 | 4 | 315 | 1.650 s | 2.05 / 1.06 |
| 6 | 1,075 | 46 | 4 | 330 | 1.625 s | 2.20 / 1.11 |
| 7 | 1,150 | 49 | 5 | 360 | 1.575 s | 2.35 / 1.21 |
| 8 | 1,225 | 52 | 5 | 375 | 1.575 s | 2.50 / 1.26 |
| 9 | 1,300 | 55 | 6 | 405 | 1.525 s | 2.65 / 1.36 |
| 10 | 1,375 | 58 | 6 | 420 | 1.500 s | 2.80 / 1.41 |

HP, damage, mana and displayed armor come from the [published Mountain King table](https://classic.battle.net/war3/human/units/mountainking.shtml). Armor intentionally uses the published rounded numbers as a coarse design anchor. Attack intervals are calculated with the [Agility formula](https://classic.battle.net/war3/basics/heroes.shtml), then rounded to our 25-ms tick. Regeneration uses that source's Human-hero formulas. They are candidate Marshal stats, not an exact Warcraft engine reproduction.

Keep this declarative without introducing an attribute hierarchy: an explicit per-level stat table can supply health, armor, damage, maximum mana, attack period and regeneration. The old constant-growth schema has been removed. One validated progression table and one derived-stat path now serve simulation, HUD, AI and generated wiki pages. Regeneration must accumulate deterministically rather than dropping fractional gains each tick.

Skills still gain ranks at levels **1 / 3 / 5** and the ultimate at **6**. Hero items, ability impact, mana recovery and the cost of death are part of the strength comparison, not just maximum HP.

### Tune all four abilities alongside HP

| Ability | Proposed payload | Mana | Cooldown | Other rules |
| --- | --- | ---: | ---: | --- |
| Faultline | **100 / 160 / 220 spell damage** | 60 | 12 s | Keep line geometry and 0.5 / 0.75 / 1 s unit stun |
| Rally the Colony | **+10% / +20% / +30% attack damage** | 50 | 25 s | 10 s duration; same buff does not stack |
| Iron Carapace | **20% / 30% / 40% damage reduction** | 50 | 25 s | 10 s duration; multiplicative with armor |
| Crownfall | **280 spell damage** | 150 | 90 s | 2 s unit stun; existing radius and telegraph |

Rally now scales the derived attack damage before Rally, including equipment and ordinary upgrades. This makes it useful for both a nine-damage early Warrior and a heavy T3 attacker without disproportionately amplifying the weakest troop. Ranks declare `damageBonusPermille`; the implemented system preserves fractional attack bonuses until final damage rounding.

Hero stun durations are half the listed unit durations. Both offensive area spells use a six-target damage budget: for `N` eligible targets, multiply each target's raw damage by `min(1, 6 / N)` before resistance. Exclude immune/ineligible targets from `N`. This preserves a dramatic six-unit hit without unlimited total damage as armies grow. It does not cap the number of stunned units, so mass control still needs a large-army test. This is the declared `damageTargetBudget` parameter.

At full per-target damage, Faultline rank one removes 27% of the candidate Archer's HP; rank three removes 59%. Against a 300-HP Warrior those numbers are 33% and 73%. Heroes are intentionally threatening to cheap T1 units. A 220-damage hit removes only 18% of the illustrative 1,200-HP T3 brute before other spell protection. Crownfall can still kill a full-health Worker, and finish a damaged army. The choice is intentional: a level-six, 150-mana ultimate earns a different damage budget from a level-one repeatable spell.

### Items, XP and revival

Start by retaining existing equipment amounts: Barkguard +2 armor, Thornband +6 damage, Heartseed +120 HP, Royal Crest +10 damage/+3 armor/+100 HP, and healing consumables at 160/400 HP. Their relative value changes with the new damage model, so test stacked duplicates and six-slot builds explicitly. Royal Crest should remain a valuable contested drop; rarity is part of its price.

Retain the current XP thresholds for the first controlled combat comparison: `0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200`. Larger camp HP will already change XP-per-minute. Measure levels three, five, six and ten before changing the XP curve too. Keep PvE progression to ten possible; do not copy Warcraft's level-five creep cutoff automatically.

Hero death preserves items and XP. Our free ten-second revival may make repeated hero sacrifices too cheap once the hero becomes stronger. Measure death-to-frontline time, including travel. A follow-up candidate is a declared **20 + 3 × (level − 1) seconds** revival, with costs considered separately; this is not required to evaluate the initial combat numbers.

## 5. What these numbers buy

**Survival budget** below means `HP / sustained incoming DPS`, with continuous unrounded damage, all attackers in range, and no movement, abilities, regeneration or repair except where stated. It is not a simulated duel outcome: the defender does not attack back. Discrete hits, windup, focus fire and collision change real results.

| Controlled comparison | Current | Proposal / reference |
| --- | ---: | ---: |
| One Warrior attacking one Warrior | 9.6 s | **50.4 s** proposed |
| One classic Footman attacking one Footman | — | **50.8 s** reference |
| Six Warriors focusing one Warrior | 1.6 s | **8.4 s** proposed |
| Nine proposed Warriors focusing one Warrior | — | **5.6 s**; illustrates more bodies at similar resource budget |
| Six Warriors attacking an idle level-one Marshal | 8.0 s | **19.6 s** proposed |
| Six Warriors attacking an idle level-ten Marshal | 142.0 s | **46.8 s** proposed |
| Six proposed Warriors attacking the proposed Main Hall | — | **83.6 s**, or **156.0 s** with one repair worker |
| Six proposed Warriors attacking proposed Barracks | — | **55.7 s** |
| Six proposed Archers attacking proposed Barracks | — | **74.3 s** |

Derived from the tables and formulas in this proposal; the Footman reference uses [Blizzard's damage/interval](https://classic.battle.net/war3/human/units/footman.shtml) and [armor curve](https://classic.battle.net/war3/basics/armorandweapontypes.shtml). The revised mirror budget is close to the Footman's. Equal-resource comparisons must also adjust unit counts: seven exact 70%-cost units cost as much as five reference units. Larger groups, area damage and new T3 troops can make battles faster without increasing every T1 soldier's DPS. The unchanged building candidates now take longer to defeat; this is an explicit retest item, not evidence that their first-draft HP is already correct.

## 6. Acceptance matches

1. **Micro:** six Warriors versus six, then mixed Warrior/Archer groups. Can the player recognize a focus target and retreat it? Are Archers useful behind a frontline, but punishable when caught?
2. **Opening camps:** Marshal plus the two starting Warriors against each easy layout. Easy camps should be a useful opening choice with competent control; record clear time, HP/mana spent and losses. Proposed starting target: 15–30 seconds per small easy camp, to be adjusted to composition.
3. **Hero threat:** levels one, five, six and ten against six and twelve basic units, first empty inventory, then representative and extreme six-slot builds. A surrounded hero must remain killable; skill cooldowns should change the outcome.
4. **Raids and cheese:** two starting Warriors attacking workers; six-unit hall assault; attacks on houses; one repair worker; unfinished and repeatedly rebuilt Barracks. Protecting the economy must cost attention and army position.
5. **Production pressure:** compare equal resource budgets and equal worker budgets separately. Measure delivered income, births, reserves and replacements. Target roughly 1.43 times as many T1 soldiers per normalized resource budget; verify whether workers, pathing or the engine entity cap prevent fielding them. Test housing growth over full matches.
6. **Tier progression:** once T2/T3 exist, test equal-cost mixed armies, a T3 brute against early troops, and T3 against heroes at levels one and ten. Measure tech timing, worker efficiency and whether counters preserve reasons to recruit T1. Do not require one basic unit to beat one elite.
7. **AI parity:** use the same armor calculation and derived stats in its combat estimates. AI now uses the same armor curve and resolved attack interval, with matchup-aware focus/spell estimates. Check camp selection, retreat and target priorities in matches.

Run at normal simulation speed for timing measurements; accelerated observer matches are useful for spotting macro behavior. Record map, content fingerprint, player configuration, game-time duration and force composition. Report outcomes before adjusting the next variable.

## Recorded implementation checks

The 9 September 2026 baseline (`4c1d51f7`) passed **340 tests across 92 files**, the game production build, wiki type checking and wiki production build. A real two-client WebSocket match remained synchronized for 3,000 ticks, with fifteen host-confirmed hashes per client and exactly 800 amber/160 wood consumed by the scripted construction and recruitment.

A **6-minute-40-second Mosswater AI opening** ran for 16,000 ticks. Both colonies built a barracks and four houses, reached 19 living workers, kept their level-two Marshals alive and fielded armies of 15 and 17 (including heroes). Three camps were cleared. Neither side had won when the probe ended. Reproduce with `node --import tsx scripts/probe-balance-match.ts`.

The final banks contained 50/65 amber and 1,030/1,020 wood. **Amber pressure versus excess lumber** is therefore an early playtest question. Keep the agreed ten-unit loads and measure gathering assignments, travel and spending before changing another variable. These checks establish that the opening plays through; the acceptance matches above remain necessary for competitive balance.

## Implementation boundary

The implemented first pass comprises the damage rule, matchup table, T1 unit pools and normalized 30% resource-price discount, building checks, Warcraft-scale Marshal growth, spell tuning and corresponding validator/HUD/AI changes. The T2/T3 bands are future design targets, not an instruction to add their entire roster now. It is a single declarative balance revision. No parallel legacy damage system, new race roster, equipment crafting chain or attribute hierarchy is needed. Wiki pages are generated from the shipped JSON. STR/AGI/INT and a longer/costed revival remain deferred.
