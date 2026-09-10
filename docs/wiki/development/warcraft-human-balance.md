---
title: Warcraft III Human balance reference
description: Human army, buildings, armor and hero progression as a reference for Under the Canopy.
---

# Warcraft III Human balance reference

::: info Research — 9 September 2026
These are **reference-game facts**, not Under the Canopy's live rules. The companion [first balance proposal](/development/first-balance-pass) translates the research into our game. Current stats remain in the generated [unit encyclopedia](/units/).
:::

::: info Research snapshot
The prototype comparisons on this page record the pre-balance implementation. The [first balance baseline](/development/first-balance-pass) is now implemented, including ten-resource loads, percentage armor and Marshal growth. Generated unit/building/ability pages show the current numbers.
:::

## Which Warcraft III?

The tables below reproduce the **baseline published in Blizzard's classic Frozen Throne strategy guide**, before optional upgrades unless stated. That guide is useful but is not a consistently versioned export of today's Reforged ladder data. Do not label these tables “current patch” or silently combine them with later changes.

Some verified later changes illustrate the distinction:

- **1.35.0, January 2023:** Peasant health increased from 230 to 240; Spell Breaker armor returned from 2 to 3. Altar hero prices and revival timing also changed. [Official live patch notes](https://news.blizzard.com/en-gb/article/23896791/warcraft-iii-reforged-patch-1-35-0-now-live).
- **2.0.3:** Piercing attacks against Heavy armor changed from 100% to **90%**. **2.0.4, January 2026:** Rifleman attack cooldown changed from 1.35 to **1.4 seconds**. These are documented in the same official patch-history post. [Official 2.0.4 and 2.0.3 notes](https://us.forums.blizzard.com/en/warcraft3/t/warcraft-iii-reforged-patch-notes-version-204/36567).

We use the published classic baseline for a reproducible design comparison, with these modern deltas explicitly separated. A complete current-ladder dataset would require a version-pinned game-data export and reconciliation of all intervening patches.

## Human army

Damage is **average damage per attack**, not DPS. Intervals are seconds between ordinary attacks before situational modifiers. Food is included because Warcraft's larger units consume more army capacity; our one-worker conversion system has a different opportunity cost.

| Unit | HP | Armor class | Armor | Average attack | Interval | Attack class | Food |
| --- | ---: | --- | ---: | ---: | ---: | --- | ---: |
| Peasant | 220 | Medium | 0 | 5.5 | 2.00 | Normal | 1 |
| Militia | 220 | Heavy | 4 | 12.5 | 1.20 | Normal | 1 |
| Footman | 420 | Heavy | 2 | 12.5 | 1.35 | Normal | 2 |
| Rifleman | 535 | Medium | 0 | 21 | 1.50 | Piercing | 3 |
| Knight | 835 | Heavy | 5 | 34 | 1.40 | Normal | 4 |
| Priest | 290 | Unarmored | 0 | 8.5 | 2.00 | Magic | 2 |
| Sorceress | 325 | Unarmored | 0 | 11 | 1.75 | Magic | 2 |
| Spell Breaker | 600 | Medium | 3 | 14 | 1.90 | Normal | 3 |
| Flying Machine | 200 | Heavy | 2 | 7.5 ground / 14.5 air | 2.50 / 2.00 | Siege / Piercing | 1 |
| Mortar Team | 360 | Heavy | 0 | 58 | 3.50 | Siege | 3 |
| Siege Engine | 700 | Fortified | 2 | 50 ground | 2.10 | Siege | 3 |
| Gryphon Rider | 825 | Light | 0 | 50 | 2.20 ground / 2.40 air | Magic | 4 |
| Dragonhawk Rider | 575 | Light | 1 | 19 | 1.75 | Piercing | 3 |

Sources: [Blizzard's Human unit table](https://classic.battle.net/war3/human/unitstats.shtml), individual [Peasant](https://classic.battle.net/war3/human/units/peasant.shtml), [Footman](https://classic.battle.net/war3/human/units/footman.shtml), [Rifleman](https://classic.battle.net/war3/human/units/rifleman.shtml), and [Knight](https://classic.battle.net/war3/human/units/knight.shtml) pages. Flying Machine ground attack requires its upgrade. The Siege Engine row describes its primary attack, not upgraded Barrage.

### What the numbers imply for us

Our inexpensive Archer should not automatically inherit a Rifleman's 535 HP: Warcraft charges three food for that unit versus two for a Footman. A fragile ranged damage dealer can be a better fit for our roster.

Role also matters more than a single “power” number. Mortars have high damage per hit but a slow interval and specialized targets. Priests contribute healing and utility. Spell Breakers bring spell interaction. Footmen have Defend. Comparing only HP multiplied by attack damage misses those differences.

Upgrades extend ordinary troops' usefulness. The published table takes Footmen from 2 to 8 armor and Rifles from 0 to 6 through upgrades. Animal War Training adds 150 HP to Knights, Gryphons and Dragonhawks; trained casters gain health and mana as well as abilities. [Unit upgrade endpoints](https://classic.battle.net/war3/human/unitstats.shtml), [Knight upgrades](https://classic.battle.net/war3/human/units/knight.shtml).

## Armor: two separate questions

**Armor class** determines which attack types work well. **Armor points** then reduce damage numerically. An “Unarmored” unit can still have armor points: the class name does not force its numeric armor to zero.

For nonnegative armor `A`:

```text
damage multiplier = 1 / (1 + 0.06 × A)
damage reduction  = (0.06 × A) / (1 + 0.06 × A)
effective HP      = HP × (1 + 0.06 × A) / attack-class multiplier
```

For negative armor, the classic guide gives damage multiplier `2 − 0.94^(−A)`. These are multipliers, not flat damage subtraction. [Blizzard armor formulas](https://classic.battle.net/war3/basics/armorandweapontypes.shtml).

| Armor points | Damage reduction | Effective HP for 420 HP, class multiplier 100% |
| ---: | ---: | ---: |
| 0 | 0% | 420 |
| 2 | 10.71% | 470.4 |
| 5 | 23.08% | 546 |
| 10 | 37.50% | 672 |
| 20 | 54.55% | 924 |

Calculated from the formula above. Each armor point adds 6% of **base HP** to effective HP against a fixed attack class. It does not subtract another six percentage points of incoming damage. The guide's prose example calling 20 armor “55% extra hitpoints” is inconsistent with its equation: the correct result is about 54.55% reduction and **120% extra effective HP**.

### Published Frozen Throne matchup table

| Attack ↓ / Armor → | Light | Medium | Heavy | Fortified | Hero | Unarmored |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Normal | 100% | 150% | 100% | 70% | 100% | 100% |
| Piercing | 200% | 75% | 100% | 35% | 50% | 150% |
| Siege | 100% | 50% | 100% | 150% | 50% | 150% |
| Magic attack | 125% | 75% | 200% | 35% | 50% | 100% |
| Chaos | 100% | 100% | 100% | 100% | 100% | 100% |
| Spell | 100% | 100% | 100% | 100% | 70% | 100% |
| Hero attack | 100% | 100% | 100% | 50% | 100% | 100% |

[Published matchup table](https://classic.battle.net/war3/basics/armorandweapontypes.shtml). **Modern delta:** use 90%, not 100%, for Piercing versus Heavy under the documented 2.0.3 change. [Official change](https://us.forums.blizzard.com/en/warcraft3/t/warcraft-iii-reforged-patch-notes-version-204/36567).

Magic **attacks** and cast **spells** are distinct categories. Ordinary spell damage is generally independent of armor points, but spell-specific rules and resistance still matter. Hero spell damage is reduced by 30%, and many disables use shorter hero durations. Chaos's all-100% row does not mean it ignores armor points. [Attack categories](https://classic.battle.net/war3/basics/armorandweapontypes.shtml), [hero resistance](https://classic.battle.net/war3/basics/heroes.shtml).

## Human buildings

These are completed-building values in the classic guide. “Upgraded HP” is the published endpoint after all three Masonry ranks, not construction health.

| Building | HP | Upgraded HP | Armor class | Base → upgraded armor |
| --- | ---: | ---: | --- | ---: |
| Town Hall | 1,500 | 2,400 | Fortified | 5 → 8 |
| Keep | 2,000 | 3,200 | Fortified | 5 → 8 |
| Castle | 2,500 | 4,000 | Fortified | 5 → 8 |
| Barracks | 1,500 | 2,400 | Fortified | 5 → 8 |
| Farm | 500 | 800 | Fortified | 5 → 8 |
| Altar of Kings | 900 | 1,440 | Fortified | 5 → 8 |
| Lumber Mill | 900 | 1,440 | Fortified | 5 → 8 |
| Blacksmith | 1,200 | 1,920 | Fortified | 5 → 8 |
| Workshop | 1,200 | 1,920 | Fortified | 5 → 8 |
| Arcane Sanctum | 1,050 | 1,680 | Fortified | 5 → 8 |
| Gryphon Aviary | 1,200 | 1,920 | Fortified | 5 → 8 |
| Arcane Vault | 485 | 776 | Fortified | 5 → 8 |
| Scout Tower | 300 | 480 | Light | 0 → 6 |
| Guard Tower | 500 | 800 | Heavy | 5 → 8 |
| Cannon Tower | 600 | 960 | Fortified | 5 → 8 |
| Arcane Tower | 500 | 800 | Heavy | 5 → 8 |

[Blizzard Human building table](https://classic.battle.net/war3/human/buildingstats.shtml). Masonry is researched at the [Lumber Mill](https://classic.battle.net/war3/human/buildings/lumbermill.shtml); ordinary structures gain 20% of base HP and one armor per rank, as its listed values demonstrate. Towers have exceptions: not every building has Fortified armor.

**Design inference:** building durability comes from HP, armor points, attack-class resistance and repair together. Raising our Barracks to 1,500 HP while retaining the old damage system would not reproduce Warcraft's behavior. Nor should defensive building stats be mistaken for a reason to add weapons to our Main Hall.

## How Human heroes grow

Warcraft separates the hero's primary attribute from its other stat benefits:

- **Strength:** +25 HP and +0.05 HP/second regeneration per point.
- **Agility:** +0.3 armor and +2% attack rate per point.
- **Intelligence:** +15 mana and +0.05 mana/second regeneration per point.
- Each point of the **primary attribute** also adds one attack damage.

Heroes gain attributes and a skill point on leveling, up to level 10. Items add another progression route; normal army upgrades do not upgrade heroes. [Blizzard hero mechanics](https://classic.battle.net/war3/basics/heroes.shtml).

### Published hero health and attack growth

Each triplet below means **level 1 / level 5 / level 10**, with no equipment or temporary spells. Armor is the guide's displayed value; do not reverse-engineer exact fractional armor from rounded UI numbers.

| Hero | HP | Average attack | Displayed armor | Mana |
| --- | --- | --- | --- | --- |
| Mountain King | 700 / 1,000 / 1,375 | 31 / 43 / 58 | 2 / 4 / 6 | 225 / 315 / 420 |
| Paladin | 650 / 900 / 1,250 | 29 / 39 / 53 | 4 / 6 / 8 | 255 / 360 / 495 |
| Archmage | 450 / 625 / 850 | 24 / 36 / 52 | 3 / 4 / 6 | 285 / 465 / 705 |
| Blood Mage | 550 / 750 / 1,000 | 24 / 36 / 51 | 2 / 3 / 5 | 285 / 465 / 690 |

Individual sources: [Mountain King](https://classic.battle.net/war3/human/units/mountainking.shtml), [Paladin](https://classic.battle.net/war3/human/units/paladin.shtml), [Archmage](https://classic.battle.net/war3/human/units/archmage.shtml), [Blood Mage](https://classic.battle.net/war3/human/units/bloodmage.shtml).

| Hero | Primary | Starting STR / AGI / INT | Growth per level STR / AGI / INT |
| --- | --- | --- | --- |
| Mountain King | Strength | 24 / 11 / 15 | 3 / 1.5 / 1.5 |
| Paladin | Strength | 22 / 13 / 17 | 2.7 / 1.5 / 1.8 |
| Archmage | Intelligence | 14 / 17 / 19 | 1.8 / 1 / 3.2 |
| Blood Mage | Intelligence | 18 / 14 / 19 | 2 / 1 / 3 |

Sources are the four hero pages above. Their base attack intervals are additionally affected by Agility. For example, the Mountain King's listed 2.22-second base interval becomes approximately `2.22 / (1 + 0.02 × 11) = 1.82` seconds at level one, before other effects. [Attack-rate formula](https://classic.battle.net/war3/basics/heroes.shtml).

### The important power spikes are skills

The Mountain King is a useful Marshal reference. In the classic guide, Storm Bolt grows **100 / 225 / 350** damage; Thunder Clap **60 / 100 / 140**. Their ranks require hero levels **1 / 3 / 5**. Avatar becomes available at **6**, adding 500 HP, five armor and 20 damage temporarily, plus spell immunity. A level-six spike therefore means much more than one extra level's HP. [Mountain King skill tables](https://classic.battle.net/war3/human/units/mountainking.shtml).

The Paladin illustrates a different growth pattern: Holy Light heals **200 / 400 / 600**, and Devotion Aura improves nearby units' armor. His power includes the army he preserves, not just his personal DPS. [Paladin skill tables](https://classic.battle.net/war3/human/units/paladin.shtml).

### Experience pacing and death

| Level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Total XP required | 0 | 200 | 500 | 900 | 1,400 | 2,000 | 2,700 | 3,500 | 4,400 | 5,400 |

Classic creep XP is reduced with hero level: 80%, 70%, 62%, 55%, then zero at level five onward. That pushes further progression toward fighting other players. [Experience rules](https://classic.battle.net/war3/basics/heroes.shtml).

That cutoff is a **design choice**, not something we must copy. Under the Canopy is also intended to support large maps and PvE progression to ten. Retain that possibility while measuring how quickly safe camps grant levels.

Revival preserves items, but Warcraft charges time and resources; modern 1.35.0 notes list altar revival times of 33 / 66 / 99 / 110 seconds for levels one through four, capped thereafter. Our current free ten-second revival is a materially different death penalty. [Revival/item rules](https://classic.battle.net/war3/basics/heroes.shtml), [updated revival timings](https://news.blizzard.com/en-gb/article/23896791/warcraft-iii-reforged-patch-1-35-0-now-live).

## What to borrow

Borrow the **percentage armor curve, separate matchup classes, survivable basic units, restrained hero stat growth, and strong skill milestones**. Derive costs, recruitment throughput, fight duration and death penalties from our worker economy. The next document gives concrete [proposed numbers and checks](/development/first-balance-pass).
