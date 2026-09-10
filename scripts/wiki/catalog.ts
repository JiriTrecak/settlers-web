import {
  ContentRegistry,
  type ContentSource,
} from "../../src/content/registry";
import { entityStats } from "../../src/sim/game/stats";
import type { Definition } from "../../src/content/schema";
import { TICK_MS } from "../../src/shared/match/match";

export const seconds = (ticks: number) =>
  `${Number(((ticks * TICK_MS) / 1000).toFixed(3))} s`;
export const escape = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const prose = (s: string) =>
  escape(s).replace(/\|/g, "&#124;").replace(/\n/g, " ");
export const table = (headers: string[], rows: (string | number)[][]) =>
  `\n| ${headers.join(" | ")} |\n| ${headers.map(() => "---").join(" | ")} |\n${rows.map((r) => `| ${r.join(" | ")} |`).join("\n")}\n`;
export function section(d: Definition) {
  return d.currency || d.kind === "resource"
    ? "resources"
    : d.kind === "building"
      ? "buildings"
      : d.kind === "unit"
        ? "units"
        : "items";
}
export const definitionPath = (d: Definition) =>
  `${section(d)}/${d.id.replaceAll(".", "-")}`;
export const spellPath = (id: string) => `abilities/${id.replaceAll(".", "-")}`;
export const page = (title: string, body: string, description = "") =>
  `---\ntitle: ${JSON.stringify(title)}\ndescription: ${JSON.stringify(description)}\n---\n\n# ${prose(title)}\n\n${body}\n`;

/** Pure projection of the same validated, composed definitions used by the game. */
export function buildCatalog(source: ContentSource) {
  const registry = new ContentRegistry(source);
  const files = new Map<string, string>();
  const defs = registry.definitions;
  const imageAssets = new Set<string>();
  const icon = (id?: string) => {
    if (!id) return "";
    const a = registry.asset(id);
    if (!a.image) return "";
    imageAssets.add(id);
    return `<img class="wiki-icon" src="/media/icons/${id}.png" alt="" width="40" height="40" loading="lazy">`;
  };
  const link = (id: string) => {
    const d = registry.get(id);
    return `[${prose(d.name)}](/${definitionPath(d)})`;
  };
  const cost = (d: Definition) => {
    const c = d.creation;
    if (!c) return "Not purchased";
    const entries = c.items.map(
      (p) => `${icon(registry.get(p.item).icon)} ${p.amount} ${link(p.item)}`,
    );
    if (c.method === "recruit")
      entries.push(`1 available ${link(c.unitInput)}`);
    return entries.join(" + ") || "No resource cost";
  };
  const bulletLinks = (ids: readonly string[]) =>
    ids.map((id) => `- ${link(id)}`).join("\n");
  for (const d of defs) {
    const b = d.behaviors;
    const base = entityStats(d, {}, registry);
    const builders = defs.filter((x) =>
      x.behaviors.work?.builds.includes(d.id),
    );
    const producers = defs.filter((x) =>
      x.behaviors.production?.outputs.includes(d.id),
    );
    let body = `<div class="entry-lead">${icon(d.icon)}<p>${prose(d.description)}</p></div>\n\n`;
    const allegiance = d.id.includes(".ants.")
      ? "[Ants](/factions/ants)"
      : "[Forest neutrals](/factions/neutrals)";
    body += `**${d.hero ? "Hero" : d.currency ? "Currency" : d.kind[0].toUpperCase() + d.kind.slice(1)}** · ${allegiance}\n\n`;
    const stats: [string, string | number][] = [];
    if (d.body)
      stats.push(
        ["Health", base.maxHp],
        [
          "Armor",
          `${d.body.armor} · ${registry.rules.armorTypes[d.body.armorType].name}`,
        ],
      );
    if (b.combat)
      stats.push(
        ["Attack damage", b.combat.damage],
        ["Damage type", b.combat.damageType],
        ["Attack range", `${b.combat.range} cells`],
        ["Attack interval", seconds(b.combat.cooldownTicks)],
        ["Aggro range", `${b.combat.aggroRange} cells`],
      );
    if (b.combat?.charge) {
      const charge = b.combat.charge;
      stats.push(["Charge approach", `${charge.minRange}–${charge.maxRange} cells`],
        ["Charge cooldown", seconds(charge.cooldownTicks)],
        ["Charge duration", seconds(charge.durationTicks)],
        ["Charge movement", `${charge.speedPermille / 1000}× normal speed`],
        ["Charge impact", `${charge.damagePermille / 1000}× attack damage`]);
    }
    if (d.creation?.method === "harvest") {
      const source = registry.get(d.creation.source), felling = source.felling;
      if (felling) stats.push(
        ["Lumber per felled tree", d.creation.amount],
        ["Axe hits required", felling.maxHp],
        ["Axe cycle", seconds(d.creation.workTicks)],
        ["Departure after final hit", seconds(felling.fallTicks)],
      );
      else stats.push(
        ["Harvest per work cycle", d.creation.amount],
        ["Harvest work cycle", `${seconds(d.creation.workTicks)} + travel`],
      );
    }
    if (d.vision) stats.push(["Vision radius", `${d.vision} cells`]);
    if (b.movement)
      stats.push(["Movement speed", `${b.movement.speed} cells / second`]);
    if (d.footprint)
      stats.push([
        "Footprint",
        `${d.footprint.width} × ${d.footprint.depth} cells`,
      ]);
    if (d.experienceYield)
      stats.push(["Experience on defeat", d.experienceYield]);
    if (d.yield) stats.push(["Resource yield", d.yield]);
    if (d.felling) stats.push(
      ["Chopping health", d.felling.maxHp],
      ["Fall duration", seconds(d.felling.fallTicks)],
      ["Sinking duration", seconds(d.felling.decayTicks)],
    );
    if (d.gatheringCapacity)
      stats.push([
        "Gathering capacity",
        `${d.gatheringCapacity} workers (shared)`,
      ]);
    if (d.constructionClearance)
      stats.push([
        "Construction clearance",
        `${d.constructionClearance} cells`,
      ]);
    if (d.regrowthTicks)
      stats.push(["Tree maturation", seconds(d.regrowthTicks)]);
    if (b.work) stats.push(["Cargo capacity", b.work.carryCapacity]);
    if (b.inventory)
      stats.push(
        ["Inventory slots", b.inventory.slots],
        ["Pickup range", `${b.inventory.pickupRange} cells`],
      );
    if (b.spellcasting)
      stats.push(
        ["Mana", base.maxMana],
        ["Mana regeneration", `${base.manaRegenPerSecond} / second`],
      );
    if (stats.length)
      body += `## At a glance\n${table(["Property", "Value"], stats)}\n`;
    if (
      builders.length ||
      producers.length ||
      d.creation?.method === "recruit"
    ) {
      body += `## How to obtain\n\n${builders.length ? `Built by ${builders.map((x) => link(x.id)).join(", ")}.` : `Produced by ${producers.map((x) => link(x.id)).join(", ")}.`}\n\n`;
      if (d.creation?.method !== "spawn")
        body += `**Cost:** ${cost(d)}.\n\n**${d.creation?.method === "recruit" ? "Training after worker arrival" : "Work time"}:** ${seconds(d.creation!.workTicks)}. Travel and blocked exits add time.\n\n`;
      else
        body +=
          "Replenishes automatically while the colony is below its living-worker capacity. The producer sets the birth interval; this is not a manual purchase.\n\n";
      if (d.creation?.method === "recruit")
        body +=
          "The barracks reserves the cost, calls an **available** worker to its entrance and transforms that same worker. Assigned gatherers and builders are protected. A queue without a free worker waits. [Recruitment rules](/guide/economy#turning-workers-into-an-army).\n\n";
    } else if (d.id === registry.rules.startingSetup.fort || d.hero) {
      body +=
        "## How to obtain\n\nIncluded in the starting colony. It is not currently offered as a new purchase in the worker command card.\n\n";
    } else if (d.kind === "unit" || d.gatheringCapacity)
      body +=
        "## Where to find it\n\nPlaced by the map author. See the [map atlas](/maps/) for locations and camp compositions.\n\n";
    if (d.requires?.length)
      body += `## Prerequisites\n\nRequires completed owned ${d.requires.map(link).join(", ")}. Losing a prerequisite locks new purchases; paid tasks continue.\n\n`;
    if (d.upgrade) {
      const u = d.upgrade;
      body += `## Building upgrade\n\nUpgrades in place to ${link(u.target)}. Cost: ${u.items.map(p => `${p.amount} ${link(p.item)}`).join(", ")}. Time: ${seconds(u.workTicks)}. Worker spawning pauses. Cancellation refunds the full price; destruction loses the paid upgrade. Identity, stored resources and existing damage are preserved.\n\n`;
    }
    if (b.research) {
      body += `## Research\n\nOne task runs at a time; queue capacity **${b.research.queueCapacity}**. Purchases are paid on enqueue. Cancellation refunds the full price. Each upgrade is researched once per colony and affects existing and future units; completed research survives loss of the Forge.\n\n`;
      body += table(["Research", "Effect", "Cost", "Time", "Requires"], b.research.outputs.map(id => {
        const r = registry.rules.research[id];
        return [prose(r.name), prose(r.description), r.items.map(p => `${p.amount} ${link(p.item)}`).join(", "), seconds(r.workTicks), r.requires?.map(link).join(", ") || "—"];
      })) + "\n";
    }
    if (b.production) {
      const p = b.production;
      body += `## Production\n\n${bulletLinks(p.outputs)}\n\n`;
      if (p.population)
        body +=
          table(
            ["Population rule", "Value"],
            [
              ["Worker capacity contributed", p.population.capacity],
              ["Birth interval", seconds(p.population.intervalTicks)],
            ],
          ) +
          "\nAll living workers count, including assigned gatherers. Capacity is pooled per owner. Losing or training a worker opens room for a replacement; this is not a lifetime birth limit.\n\n";
      if (p.workerSlots)
        body += `**Staffing:** ${p.workerSlots} worker${p.workerSlots === 1 ? "" : "s"}.\n\n`;
      if (p.workRadius) body += `**Work radius:** ${p.workRadius} cells.\n\n`;
      if (p.queueCapacity)
        body += `**Queue capacity:** ${p.queueCapacity}.\n\n`;
    }
    if (b.storage)
      body += `## Storage\n\nAccepts ${b.storage.accepts.map(link).join(", ")}; total capacity **${b.storage.capacity.toLocaleString("en-US")}**.${b.storage.dropoff ? " Workers deposit their loads here, making those resources available to spend." : " Production costs are reserved from the colony’s hall stores."}\n\n`;
    if (b.work)
      body += `## Worker tasks\n\nGather ${b.work.harvests?.map(link).join(" and ") || "no declared currencies"}. Right-click a source to assign work; use Stop to release a worker for recruitment.\n\n### Can construct\n\n${bulletLinks(b.work.builds)}\n\n`;
    if (b.revival)
      body += `## Hero revival\n\nRevives fallen owned heroes in **${seconds(b.revival.workTicks)}**, with a queue capacity of **${b.revival.queueCapacity}**. Revival is currently free. Items, experience and learned abilities persist through death. The same hero returns with full health and mana; a blocked exit delays completion. This building does not currently sell additional heroes.\n\n`;
    if (b.progression) {
      const p = b.progression;
      body += `## Levels\n\nNearby enemy defeats share experience between eligible heroes within **${p.experienceRadius} cells**. These are base stats, before equipment or temporary effects. Leveling adds increases in maximum health and mana to their current pools; it preserves existing damage and spent mana.\n${table(
        ["Level", "Total XP", "Health", "Damage", "Armor", "Attack interval", "Mana", "HP / mana per second"],
        p.levels.map((l) => {
          const stats = entityStats(d, {progression: {experience: l.experience}}, registry);
          return [stats.level, l.experience, stats.maxHp, stats.damage, stats.armor,
            seconds(stats.cooldownTicks), stats.maxMana,
            `${stats.healthRegenPerSecond} / ${stats.manaRegenPerSecond}`];
        }),
      )}\n`;
    }
    if (b.spellcasting)
      body += `## Abilities\n\n${b.spellcasting.abilities.map((id) => `- [${registry.rules.spells[id].name}](/${spellPath(id)}) — ${prose(registry.rules.spells[id].description)}`).join("\n")}\n\nLearn ranks with skill points. See [heroes and items](/guide/heroes) for progression and targeting.\n\n`;
    if (d.itemEffect) {
      const e = d.itemEffect;
      body += `## Effect\n\n${e.type === "equipment" ? "Passive while carried in a hero inventory." : "Consumed when activated from the hero inventory."}\n\n`;
      body += table(
        ["Effect", "Value"],
        Object.entries(e)
          .filter(([k, v]) => k !== "type" && typeof v === "number" && v !== 0)
          .map(([k, v]) => [
            (
              {
                maxHp: "Maximum health",
                damage: "Damage",
                armor: "Armor",
                heal: "Healing",
                mana: "Mana restored",
              } as Record<string, string>
            )[k] ?? k,
            String(v),
          ]),
      );
      const pools = Object.entries(registry.rules.lootPools).filter(([, p]) =>
        p.entries.some((x) => x.item === d.id),
      );
      body += `\n## Drops\n\n${pools.map(([id]) => `[${id.split(".").at(-1)} camps](/guide/loot#${id.replaceAll(".", "-")})`).join(", ")}. Rolls are weighted; [the loot tables](/guide/loot) list exact chances per roll. Items remain with a fallen hero and return on revival.\n\n`;
    }
    if (d.currency) {
      const dropoffs = defs.filter(x => x.behaviors.storage?.dropoff && x.behaviors.storage.accepts.includes(d.id));
      body += `## Gathering and spending\n\nWorkers gather this currency directly from ${d.creation?.method === "harvest" ? link(d.creation.source) : "its declared resource source"} and carry it to a completed owned drop-off: ${dropoffs.map(x => link(x.id)).join(", ")}. It enters the spendable colony bank on delivery. Currency never appears as a loose ground item.\n\n### Used by\n\n${bulletLinks(defs.filter((x) => x.creation?.items.some((c) => c.item === d.id) || x.upgrade?.items.some(c => c.item === d.id)).map((x) => x.id))}\n\n`;
    }
    if (d.gatheringCapacity)
      body +=
        "Assignments count for the entire gather-and-return trip, including approach and cargo delivery. Right-click with workers to assign them. The mine belongs to no player and cannot be captured; occupancy is shared. Its label shows current assigned workers / capacity. Buildings must leave its declared access clearance.\n\n";
    if (d.kind === "building" && !b.combat)
      body +=
        "## Role\n\nHas **no automatic attack** in the current definitions.\n\n";
    body += `## Related reading\n\n[Economy](/guide/economy) · [Combat](/guide/combat) · [${section(d)} index](/${section(d)}/)\n\n<details class="source-details"><summary>Content source</summary>\n\nDefinition: \`${d.id}\`  \nModel reference: \`${d.asset}\`  \nGenerated from \`content/game.json\`, with behavior sets expanded by the game registry. Balance revision: \`${registry.fingerprint}\`.\n\n</details>\n`;
    files.set(`${definitionPath(d)}.md`, page(d.name, body, d.description));
  }
  for (const [id, s] of Object.entries(registry.rules.spells)) {
    const hosts = defs.filter((d) =>
      d.behaviors.spellcasting?.abilities.includes(id),
    );
    let body = `<div class="entry-lead">${icon(s.icon)}<p>${prose(s.description)}</p></div>\n\nUsed by ${hosts.map((d) => link(d.id)).join(", ")}. **Shortcut: ${s.hotkey}**. **Target: ${s.target === "self" ? "self" : "ground position"}**.\n\n`;
    const columns: [
      string,
      (r: (typeof s.ranks)[number]) => string | number,
    ][] = [
      ["Hero level", (r) => r.requiredLevel],
      ["Mana", (r) => r.mana],
      ["Cooldown", (r) => seconds(r.cooldownTicks)],
      ["Cast time", (r) => seconds(r.castTicks)],
    ];
    const optional: typeof columns = [
      ["Damage", (r) => r.damage],
      ["Range (cells)", (r) => r.range],
      ["Radius (cells)", (r) => r.radius],
      ["Stun", (r) => seconds(r.stunTicks)],
      ["Duration", (r) => seconds(r.durationTicks)],
      ["Bonus attack damage", (r) => `${r.damageBonusPermille / 10}%`],
      ["Damage reduction", (r) => `${r.reductionPermille / 10}%`],
    ];
    for (const c of optional)
      if (
        s.ranks.some((r) => ![0, "0 s", "0%"].includes(c[1](r))) &&
        !(s.effect === "guard" && /Radius|Range/.test(c[0]))
      )
        columns.push(c);
    if (s.damageTargetBudget) body += `Area damage has a **${s.damageTargetBudget}-target budget**: beyond that many eligible targets, damage per target is multiplied by ${s.damageTargetBudget} / target count before resistance. Stuns affect units only; heroes receive ${registry.rules.heroStunDurationPermille / 10}% duration.\n\n`;
    body += `## Ranks\n${table(
      ["Property", ...s.ranks.map((_, i) => `Rank ${i + 1}`)],
      columns.map(([name, read]) => [name, ...s.ranks.map(read)]),
    )}\n`;
    body +=
      s.effect === "line"
        ? "## Targeting\n\nA flat-ended line from the Marshal toward the chosen ground position. Its full width is **twice the radius**. The footprint and casting range appear before you commit.\n\n"
        : s.effect === "blast"
          ? "## Targeting\n\nA circle centered on the chosen ground position. The footprint and casting range appear before you commit.\n\n"
          : s.effect === "guard"
            ? "## Targeting\n\nProtects the caster only. The declaration’s radius does not turn this self-guard effect into an area shield.\n\n"
            : "## Targeting\n\nA self-centered rally affecting nearby friendly units.\n\n";
    body +=
      "For ground abilities, invalid or unexplored destinations show red. Escape or right-click cancels targeting.\n\n";
    files.set(`${spellPath(id)}.md`, page(s.name, body, s.description));
  }
  let loot =
    "Camp rewards use weighted rolls after the camp is cleared. Each roll selects independently **with replacement**, so multi-roll pools can give duplicate items. Percentages below are **per roll**, not the chance of receiving at least one copy from the camp.\n\n";
  for (const [id, p] of Object.entries(registry.rules.lootPools)) {
    const sum = p.entries.reduce((a, e) => a + e.weight, 0);
    loot += `## ${id.split(".").at(-1)} camps {#${id.replaceAll(".", "-")}}\n\n**${p.rolls} roll${p.rolls === 1 ? "" : "s"} per cleared camp.**\n${table(
      ["Reward", "Weight", "Chance per roll"],
      p.entries.map((e) => [
        e.item ? link(e.item) : "No item",
        e.weight,
        `${Number(((e.weight / sum) * 100).toFixed(2))}%`,
      ]),
    )}\n`;
  }
  files.set(
    "guide/loot.md",
    page("Loot tables", loot, "Camp rewards, drop weights and hero equipment."),
  );
  const catalog = defs.map((d) => ({
    id: d.id,
    name: d.name,
    description: d.description,
    path: `/${definitionPath(d)}`,
    section: section(d),
    icon: d.icon ? `/media/icons/${d.icon}.png` : "",
    faction: d.id.includes(".ants.") ? "ants" : "neutral",
  }));
  for (const group of ["buildings", "units", "items", "resources"]) {
    const entries = defs.filter((d) => section(d) === group);
    files.set(
      `${group}/index.md`,
      page(
        group[0].toUpperCase() + group.slice(1),
        `Current playable content. Every entry is generated from the validated game definitions. ${group === "units" ? "Only Ants are playable; neutral creatures belong to map camps." : group === "items" ? "Hero equipment and consumables. Spendable amber and wood are under [resources](/resources/)." : ""}\n\n<WikiCatalog section="${group}" />\n\n${table(
          [
            "Entry",
            group === "buildings" || group === "units" ? "Health" : "Type",
            "Role",
          ],
          entries.map((d) => [
            link(d.id),
            d.body?.maxHp ??
              (d.currency ? "Currency" : (d.itemEffect?.type ?? "Resource")),
            prose(d.description),
          ]),
        )}`,
      ),
    );
  }
  files.set(
    "abilities/index.md",
    page(
      "Abilities",
      Object.entries(registry.rules.spells)
        .map(
          ([id, s]) =>
            `## [${s.name}](/${spellPath(id)})\n\n${icon(s.icon)} ${prose(s.description)}\n\nShortcut **${s.hotkey}** · ${s.ranks.length} rank${s.ranks.length === 1 ? "" : "s"}`,
        )
        .join("\n\n"),
    ),
  );
  const fragments: Record<string, string> = {};
  const setup = registry.rules.startingSetup;
  const opening = new Map<string, number>();
  for (const u of setup.units)
    opening.set(u.definition, (opening.get(u.definition) ?? 0) + 1);
  fragments.opening = table(
    ["Starting asset", "Amount"],
    [
      [link(setup.fort), 1],
      ...Array.from(opening, ([id, n]) => [link(id), n]),
      ...Object.entries(setup.inventory).map(([id, n]) => [link(id), n]),
    ],
  );
  fragments.assignments =
    (setup.gathering ?? [])
      .map((g) => `${g.workers} workers begin gathering ${link(g.item)}`)
      .join("; ") + ".";
  fragments.population = table(
    ["Producer", "Living-worker capacity", "Birth interval"],
    defs
      .filter((d) => d.behaviors.production?.population)
      .map((d) => [
        link(d.id),
        d.behaviors.production!.population!.capacity,
        seconds(d.behaviors.production!.population!.intervalTicks),
      ]),
  );
  fragments.recruitment = table(
    ["Unit", "Cost", "Training after arrival"],
    defs
      .filter((d) => d.creation?.method === "recruit")
      .map((d) => [link(d.id), cost(d), seconds(d.creation!.workTicks)]),
  );
  fragments.limits = `The current engine safety limits are **${registry.rules.maxUnits} units** and **${registry.rules.maxBuildings} buildings**. These are separate from worker capacity; this is not an unlimited-army mode.`;
  fragments.armor = table(
    ["Attack class", ...Object.values(registry.rules.armorTypes).map(a => a.name), "Armor points apply"],
    Object.entries(registry.rules.damageTypes).map(([id, type]) => [
      type.name,
      ...Object.keys(registry.rules.armorTypes).map(armor => `${registry.rules.damageMultipliers[id][armor] / 10}%`),
      type.appliesArmor ? "Yes" : "No",
    ]),
  );
  fragments.shortcuts = table(
    ["Command", "Key", "Effect"],
    [
      ...Object.values(registry.actions.actions),
      ...Object.values(registry.actions.categories),
      registry.actions.navigation.back,
    ]
      .filter((a) => a.hotkey)
      .map((a) => [a.name, a.hotkey!, prose(a.description)]),
  );
  return { registry, files, imageAssets, catalog, fragments };
}
