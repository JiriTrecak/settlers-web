import {value} from '../../src/content/abilities/schema';
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
    if (d.supplyCost) entries.push(`${d.supplyCost} supply`);
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
      ["Standing reserve health", d.felling.maxHp],
      ["Fall duration", seconds(d.felling.fallTicks)],
      ["Sinking duration", seconds(d.felling.decayTicks)],
    );
    if (d.harvesting)
      stats.push([
        "Recommended workers",
        `${d.harvesting.recommendedWorkers} workers; ${d.harvesting.activeWorkers} actively extracting`,
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
    if (b.abilities)
      stats.push(
        ["Mana", base.maxMana],
        ["Mana regeneration", `${base.manaRegenPerSecond} / second`],
      );
    if (stats.length)
      body += `## At a glance\n${table(["Property", "Value"], stats)}\n`;
    if (
      builders.length ||
      producers.length ||
      d.creation?.method === "train"
    ) {
      body += `## How to obtain\n\n${builders.length ? `Built by ${builders.map((x) => link(x.id)).join(", ")}.` : `Produced by ${producers.map((x) => link(x.id)).join(", ")}.`}\n\n`;
      body += `**Cost:** ${cost(d)}.\n\n**Work time:** ${seconds(d.creation!.workTicks)}. Blocked exits can delay deployment.\n\n`;
      if (d.creation?.method === "train") body += "Resources and supply are reserved on enqueue. Training creates a new unit; workers are never converted. Started training finishes even if supply capacity is lost.\n\n";
    } else if (d.id === registry.rules.startingSetup.fort || d.hero) {
      body +=
        "## How to obtain\n\nIncluded in the starting colony. It is not currently offered as a new purchase in the worker command card.\n\n";
    } else if (d.kind === "unit" || d.harvesting)
      body +=
        "## Where to find it\n\nPlaced by the map author. See the [map atlas](/maps/) for locations and camp compositions.\n\n";
    if (d.requires?.length)
      body += `## Prerequisites\n\nRequires completed owned ${d.requires.map(link).join(", ")}. Upgraded descendants also satisfy these requirements. Losing a prerequisite locks new purchases; paid tasks continue.\n\n`;
    if (d.upgrade) {
      const u = d.upgrade;
      body += `## Building upgrade\n\nUpgrades in place to ${link(u.target)}. Cost: ${u.items.map(p => `${p.amount} ${link(p.item)}`).join(", ")}. Time: ${seconds(u.workTicks)}. Unit training pauses. Cancellation refunds the full price; destruction loses the paid upgrade. Identity, stored resources and existing damage are preserved.\n\n`;
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
      if (p.workerSlots)
        body += `**Staffing:** ${p.workerSlots} worker${p.workerSlots === 1 ? "" : "s"}.\n\n`;
      if (p.workRadius) body += `**Work radius:** ${p.workRadius} cells.\n\n`;
      if (p.queueCapacity)
        body += `**Queue capacity:** ${p.queueCapacity}.\n\n`;
    }
    if (d.heroCapacity) body += `**Hero roster capacity:** ${d.heroCapacity}. Only the highest completed Hall counts; extra Halls do not add slots. Living, fallen and training heroes reserve distinct entries.\n\n`;
    if (d.hero) body += `**Hero roster:** recruitment requires a free Hall roster slot and a different hero from those already owned, fallen or queued. Each hero uses ${d.supplyCost} supply. The selected starting hero is free.\n\n`;
    if (d.supplyProvided) body += `**Supply provided:** ${d.supplyProvided} when completed.\n\n`;
    if (b.storage)
      body += `## Storage\n\nAccepts ${b.storage.accepts.map(link).join(", ")}; total capacity **${b.storage.capacity.toLocaleString("en-US")}**.${b.storage.dropoff ? " Workers deposit their loads here, making those resources available to spend." : " Production costs are paid from the player wallet."}\n\n`;
    if (b.work)
      body += `## Worker tasks\n\nGather ${b.work.harvests?.map(link).join(" and ") || "no declared currencies"}. Right-click a source to assign work; use Stop to release a worker for another task.\n\n### Can construct\n\n${bulletLinks(b.work.builds)}\n\n`;
    if (b.revival) {
      const price=(items: typeof b.revival.items) => items.map(p=>`${p.amount} ${link(p.item)}`).join(' + ') || 'no resources';
      body += `## Hero revival\n\nLevel one costs **${price(b.revival.items)}** and takes **${seconds(b.revival.workTicks)}**. Each additional level adds **${price(b.revival.itemsPerLevel)}** and **${seconds(b.revival.workTicksPerLevel)}**. Queue capacity: **${b.revival.queueCapacity}**. Admission pays the price; cancellation refunds it fully, while destruction loses the paid cost. Items, experience and learned abilities persist. The same hero returns with full health and mana; a blocked exit delays deployment. ${b.production ? "Recruitment and revival share one ordered queue and work lane." : ""}\n\n`;
    }
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
    if(b.abilities)body += `## Abilities

${b.abilities.bindings.map(b=>{const a=registry.abilityLibrary.abilities.find(a=>a.id===b.ability)!;return `- [${a.name}](/${spellPath(a.id)}) — ${prose(a.description)}`;}).join('\n')}

`;
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
    if (d.harvesting)
      body +=
        "Assignments count for the entire gather-and-return trip, including approach and cargo delivery. Right-click with workers to assign them. The mine belongs to no player and cannot be captured; occupancy is shared. Its label shows assigned workers; the recommendation is not an assignment limit. Extra miners wait in arrival order. Buildings must leave its declared access clearance.\n\n";
    if (d.kind === "building" && !b.combat)
      body +=
        "## Role\n\nHas **no automatic attack** in the current definitions.\n\n";
    body += `## Related reading\n\n[Economy](/guide/economy) · [Combat](/guide/combat) · [${section(d)} index](/${section(d)}/)\n\n<details class="source-details"><summary>Content source</summary>\n\nDefinition: \`${d.id}\`  \nModel reference: \`${d.asset}\`  \nGenerated from \`content/game.json\`, with behavior sets expanded by the game registry. Balance revision: \`${registry.fingerprint}\`.\n\n</details>\n`;
    files.set(`${definitionPath(d)}.md`, page(d.name, body, d.description));
  }
  for(const s of registry.abilityLibrary.abilities){
    const hosts=defs.filter(d=>d.behaviors.abilities?.bindings.some(b=>b.ability===s.id));
    const rows=s.ranks.map((r,i)=>[i+1,value(s.cast.cost.amount,r),seconds(value(s.cast.cooldown.ticks,r)),value(s.targeting.range,r)]);
    const body=`${prose(s.description)}\n\nUsed by ${hosts.map(d=>link(d.id)).join(', ')}. Target: living visible unit.\n\n${table(['Rank','Mana','Cooldown','Range'],rows)}\n\nCosts commit on release. Interruption before release refunds mana.\n`;
    files.set(`${spellPath(s.id)}.md`,page(s.name,body,s.description));
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
      registry.abilityLibrary.abilities.map(s=>`## [${s.name}](/${spellPath(s.id)})\n\n${prose(s.description)}\n\n${s.ranks.length} ranks`)
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
  if(setup.hero)fragments.opening += `\nChoose one starting hero before the match: ${setup.hero.choices.map(link).join(', ')}. Default: ${link(setup.hero.default)}. The hero uses four supply and has no starting purchase cost.\n`;
  fragments.assignments =
    (setup.gathering ?? [])
      .map((g) => `${g.workers} workers begin gathering ${link(g.item)}`)
      .join("; ") + ".";
  fragments.population = table(["Building", "Supply provided"], defs.filter(d => d.supplyProvided).map(d => [link(d.id), d.supplyProvided!]));
  fragments.recruitment = table(
    ["Unit", "Cost", "Training time"],
    defs
      .filter((d) => d.creation?.method === "train")
      .map((d) => [link(d.id), cost(d), seconds(d.creation!.workTicks)]),
  );
  fragments.limits = `The current engine safety limits are **${registry.rules.maxUnits} units** and **${registry.rules.maxBuildings} buildings**. Supply is capped at **${registry.rules.maxSupply}** per colony.`;
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
