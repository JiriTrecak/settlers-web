import { readFile, readdir, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { watch } from "node:fs";
import { spawn } from "node:child_process";
import {
  buildCatalog,
  page,
  table,
  definitionPath,
  spellPath,
  escape,
} from "./catalog";
import { parseUtcMap } from "../../src/shared/map/utcmap";
import { validatePlacements } from "../../src/content/map";
import { mapSvg } from "./maps";
export const root = path.resolve(
  fileURLToPath(new URL("../../", import.meta.url)),
);
const destination = path.join(root, "wiki/.generated");
const designs = [
  "declaration-proposal.md",
  "declaration-rebuild-spec.md",
  "declaration-scenario-review.md",
  "production-and-work-spec.md",
];
async function paths(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) =>
        e.isDirectory()
          ? paths(path.join(dir, e.name))
          : path.join(dir, e.name),
      ),
    )
  )
    .flat()
    .sort();
}
/** Only generated output is owned here. Validate everything before touching the previous successful build. */
export async function writeGenerated(
  out: string,
  files: Map<string, string | Buffer>,
) {
  for (const name of files.keys())
    if (path.isAbsolute(name) || name.split("/").includes(".."))
      throw new Error(`Unsafe output path: ${name}`);
  let previous: string[] = [];
  try {
    previous = JSON.parse(
      await readFile(path.join(out, ".manifest.json"), "utf8"),
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  if (
    !Array.isArray(previous) ||
    previous.some(
      (name) =>
        typeof name !== "string" ||
        path.isAbsolute(name) ||
        name.split("/").includes(".."),
    )
  )
    throw new Error("Unsafe manifest entry");
  for (const [name, value] of files) {
    const target = path.join(out, name);
    const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
    let same = false;
    try {
      same = buffer.equals(await readFile(target));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    if (!same) {
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, buffer);
    }
  }
  for (const name of previous)
    if (!files.has(name)) {
      await rm(path.join(out, name), { force: true });
    }
  await writeFile(
    path.join(out, ".manifest.json"),
    JSON.stringify([...files.keys()].sort(), null, 2),
  );
}
export async function generate() {
  const source = JSON.parse(
    await readFile(path.join(root, "content/game.json"), "utf8"),
  );
  const {
    registry,
    files: pages,
    imageAssets,
    catalog,
    fragments,
  } = buildCatalog(source);
  const files = new Map<string, string | Buffer>(pages);
  const authored = path.join(root, "docs/wiki");
  for (const file of await paths(authored)) {
    const key = path.relative(authored, file);
    // Authored illustrations travel with the prose and are manifest-owned output.
    if (key.startsWith(`media${path.sep}`) && /\.(svg|png|webp|jpg|jpeg)$/.test(file)) {
      files.set(`public/${key}`, await readFile(file));
      continue;
    }
    if (!file.endsWith(".md")) continue;
    if (files.has(key))
      throw new Error(`Authored page would override generated entry: ${key}`);
    files.set(
      key,
      (await readFile(file, "utf8")).replace(
        /\{\{stats:([\w-]+)\}\}/g,
        (_, id: string) => {
          if (!(id in fragments))
            throw new Error(`Unknown wiki fragment ${id} in ${key}`);
          return fragments[id];
        },
      ),
    );
  }
  const maps: {
    id: string;
    name: string;
    size: number;
    players: number;
    camps: number;
    mines: number;
    description: string;
    image: string;
    path: string;
  }[] = [];
  for (const dir of ["showcase", "skirmish", "campaign"])
    for (const file of await paths(path.join(root, "assets/maps", dir))) {
      if (!file.endsWith(".utcmap")) continue;
      const map = parseUtcMap(JSON.parse(await readFile(file, "utf8")));
      if (!map) throw new Error(`Invalid wiki map: ${file}`);
      validatePlacements(map, registry);
      const id = path.basename(file, ".utcmap");
      if (maps.some((m) => m.id === id))
        throw new Error(`Duplicate map slug: ${id}`);
      const mines = map.entities.filter(
        (e) => registry.get(e.definition).gatheringCapacity,
      );
      const summary = {
        id,
        name: map.name,
        size: map.size,
        players: map.playerStarts.length,
        camps: map.camps.length,
        mines: mines.length,
        description: map.description ?? "",
        image: `/media/maps/${id}.svg`,
        path: `/maps/${id}`,
      };
      maps.push(summary);
      files.set(`public/media/maps/${id}.svg`, mapSvg(map));
      const defLink = (id: string) =>
        `[${registry.get(id).name}](/${definitionPath(registry.get(id))})`;
      let body = `${escape(map.description ?? "")}\n\n![${escape(map.name)} terrain and starting positions](${summary.image})\n\n*North up. Numbered circles: player starts. Amber squares: amber mines. Purple circles: root deposits. Diamonds: camps (pale = easy, orange = medium, red = hard, purple = T3 bosses). This is the authored starting layout, not a live match view.*\n\n`;
      body += table(
        ["Map facts", "Value"],
        [
          ["Mode", map.mission ? "Campaign mission" : "Skirmish"],
          ["Dimensions", `${map.size} × ${map.size} cells`],
          ["Player slots", map.playerStarts.length],
          ["Amber mines", mines.filter(e=>e.definition==="building.neutral.amber-mine").length],
          ["Root deposits", mines.filter(e=>e.definition==="building.neutral.corrupted-root").length],
          ["Neutral camps", map.camps.length],
          ["Source", `\`assets/maps/${dir}/${id}.utcmap\``],
        ],
      );
      body += `\n## Starting positions\n${table(
        ["Slot", "X", "Y"],
        map.playerStarts.map((p) => [`Player ${p.player}`, p.x, p.z]),
      )}\n${map.mission ? "Open Campaign → Vanguard to play this mission. Mission maps are hidden from Skirmish. [Campaign guide](/guide/campaign)." : "Select your human slot in Skirmish to start at that position. Assign all slots to AI to observe. [Match setup](/guide/getting-started)."}\n\n`;
      if (map.camps.length)
        body += `## Neutral camps\n\nAuthored defenders may begin on the map or arrive through a mission script. Cleared camps no longer contain these units during a match.\n${table(
          ["Camp", "Location", "Defenders", "Reward pool"],
          map.camps.map((c) => {
            const counts = new Map<string, number>();
            for (const id of c.members) {
              const e = map.entities.find((e) => e.id === id)!;
              counts.set(e.definition, (counts.get(e.definition) ?? 0) + 1);
            }
            return [
              escape(c.id),
              `${c.home.x}, ${c.home.y}`,
              [...counts].map(([id, n]) => `${n} × ${defLink(id)}`).join(", "),
              c.lootPool
                ? `[${c.lootPool.split(".").at(-1)}](/guide/loot#${c.lootPool.replaceAll(".", "-")})`
                : "None",
            ];
          }),
        )}`;
      files.set(`maps/${id}.md`, page(map.name, body, map.description));
    }
  files.set(
    "maps/index.md",
    page(
      "Map atlas",
      "Explore the authored battlefields. Previews and camp lists are generated from the same map files loaded by Skirmish, Campaign and the editor.\n\n<WikiMaps />",
    ),
  );
  // Preserve relative links inside technical documentation. Old design logs are explicitly historical.
  const technical: string[] = [];
  for (const file of await paths(path.join(root, "docs"))) {
    if (!file.endsWith(".md") || file.startsWith(authored + path.sep)) continue;
    const rel = path.relative(path.join(root, "docs"), file);
    const historical =
      rel.startsWith("build-plan/") ||
      rel === "expansion/hero-economy.md" ||
      ["reference-landscapes.md", "vivid-landscapes.md"].includes(rel);
    let md = await readFile(file, "utf8");
    // References outside docs point to repository sources, not imaginary static pages.
    md = md.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (full, label: string, href: string) => {
        href=href.replace(/^<|>$/g, "");
        if (href.startsWith(root + path.sep))
          return `${label} (repository source: \`${path.relative(root, href)}\`)`;
        if (/^(https?:|#|\/)/.test(href)) return full;
        const target = path.resolve(path.dirname(file), href.split("#")[0]);
        if (!target.startsWith(path.join(root, "docs") + path.sep))
          return `${label} (repository source: \`${path.relative(root, target)}\`)`;
        return full;
      },
    );
    const title = md.match(/^# (.+)$/m)?.[1] ?? rel;
    const notice = historical
      ? "::: warning Design history\nThis document preserves an earlier design or implementation checkpoint. Its balance values and retired production chains are not current game rules. Use the [game guide](/guide/economy) and generated encyclopedia for current behavior.\n:::"
      : "::: info Developer reference\nThis is an engineering document. For player rules and current balance, use the [game guide](/guide/getting-started) and [encyclopedia](/buildings/).\n:::";
    md = md.replace(/^# .+$/m, (m) => `${m}\n\n${notice}`);
    files.set(
      `development/${rel}`,
      `---\ntitle: ${JSON.stringify(title)}\n${historical ? "search: false\n" : ""}---\n\n${md}`,
    );
    technical.push(rel);
  }
  for (const name of designs) {
    let md = await readFile(path.join(root, name), "utf8");
    const title = md.match(/^# (.+)$/m)?.[1] ?? name;
    md = md.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (full, label: string, raw: string) => {
        const href = raw.replace(/^<|>$/g, "");
        if (/^(https?:|#)/.test(href)) return full;
        const [file, fragment] = href.split("#");
        const target = path.relative(root, path.resolve(root, file));
        const suffix = fragment ? `#${fragment}` : "";
        if (designs.includes(target))
          return `[${label}](/development/design/${target.replace(".md", "")}${suffix})`;
        if (target.startsWith("docs/") && target.endsWith(".md"))
          return `[${label}](/development/${target.slice(5).replace(".md", "")}${suffix})`;
        return `${label} (repository source: \`${target}\`)`;
      },
    );
    md = md.replace(
      /^# .+$/m,
      (heading) =>
        `${heading}\n\n::: warning Design history\nAn earlier proposal, retained for design rationale. Its production chains and balance values may be retired. Read the [current economy](/guide/economy) and [implementation contracts](/development/declarations/README) for the running game.\n:::`,
    );
    files.set(
      `development/design/${name}`,
      `---\ntitle: ${JSON.stringify(title)}\nsearch: false\n---\n\n${md}`,
    );
    technical.push(`design/${name}`);
  }
  const sections = ["buildings", "units", "items", "resources"];
  const navigation = [
    {
      text: "Devlog",
      collapsed: false,
      items: [
        { text: "Behind the canopy", link: "/devlog/" },
        { text: "01 · Teaching an army to listen", link: "/devlog/teaching-an-army-to-listen" },
      ],
    },
    {
      text: "Start playing",
      items: [
        { text: "Welcome", link: "/" },
        { text: "Vanguard campaign", link: "/guide/campaign" },
        { text: "First match", link: "/guide/getting-started" },
        { text: "Economy & workers", link: "/guide/economy" },
        { text: "Combat & victory", link: "/guide/combat" },
        { text: "Terrain & high ground", link: "/guide/terrain" },
        { text: "Heroes & inventory", link: "/guide/heroes" },
        { text: "Controls", link: "/guide/controls" },
        { text: "Loot tables", link: "/guide/loot" },
      ],
    },
    {
      text: "Factions & world",
      collapsed: false,
      items: ["ants", "beetles", "bees", "neutrals", "story"].map((id) => ({
        text: {
          ants: "Ants",
          beetles: "Beetles · planned",
          bees: "Bees · planned",
          neutrals: "Forest neutrals",
          story: "World & campaigns",
        }[id],
        link: `/factions/${id}`,
      })),
    },
    ...sections.map((group) => ({
      text: group[0].toUpperCase() + group.slice(1),
      collapsed: true,
      items: [
        { text: "Overview", link: `/${group}/` },
        ...catalog
          .filter((c) => c.section === group)
          .map((c) => ({ text: c.name, link: c.path })),
      ],
    })),
    {
      text: "Abilities",
      collapsed: true,
      items: [
        { text: "Overview", link: "/abilities/" },
        ...Object.entries(registry.rules.spells).map(([id, s]) => ({
          text: s.name,
          link: `/${spellPath(id)}`,
        })),
      ],
    },
    {
      text: "Map atlas",
      collapsed: true,
      items: [
        { text: "All maps", link: "/maps/" },
        ...maps.map((m) => ({ text: m.name, link: m.path })),
      ],
    },
    {
      text: "Development",
      collapsed: true,
      items: [
        { text: "Authoring the wiki", link: "/development/" },
        { text: "Mission scripting & Lua", link: "/development/mission-scripting" },
        { text: "Performance & loading", link: "/development/performance" },
        { text: "Warcraft Human balance research", link: "/development/warcraft-human-balance" },
        { text: "First combat balance baseline", link: "/development/first-balance-pass" },
        ...[
          "declarations/README.md",
          "declarations/behaviors.md",
          "declarations/examples.md",
          "declarations/systems.md",
          "declarations/team-color.md",
          "declarations/validation.md",
          "game/economy.md",
          "ai/implementation.md",
          "expansion/hero-revival.md",
          "expansion/spell-effects.md",
          "expansion/weather.md",
          "expansion/graphics-settings.md",
        ].map((rel) => ({
          text: (
            {
              "declarations/README.md": "Declarative architecture",
              "declarations/behaviors.md": "Behavior reference",
              "declarations/examples.md": "Content examples",
              "declarations/systems.md": "Simulation systems",
              "declarations/team-color.md": "Team-color materials",
              "declarations/validation.md": "Validation & acceptance",
              "game/economy.md": "Economy implementation",
              "ai/implementation.md": "Opponent AI",
              "expansion/hero-revival.md": "Targeting & hero revival",
              "expansion/spell-effects.md": "Spell effects",
              "expansion/weather.md": "Weather",
              "expansion/graphics-settings.md": "Graphics settings",
            } as Record<string, string>
          )[rel],
          link: `/development/${rel.replace(".md", "")}`,
        })),
        { text: "Document archive", link: "/development/archive" },
      ],
    },
  ];
  files.set(
    "development/archive.md",
    page(
      "Document archive",
      "Technical references and historical plans retained from the repository. Older plans are labeled on their pages; their mechanics may have been superseded.\n\n" +
        technical
          .map((rel) => `- [${rel}](/development/${rel.replace(".md", "")})`)
          .join("\n"),
    ),
  );
  files.set("navigation.json", JSON.stringify(navigation, null, 2));
  files.set(
    "catalog.json",
    JSON.stringify(
      { entries: catalog, maps, fingerprint: registry.fingerprint },
      null,
      2,
    ),
  );
  for (const id of imageAssets) {
    const sourcePath = path.resolve(root, registry.asset(id).image!);
    if (!sourcePath.startsWith(path.join(root, "assets") + path.sep))
      throw new Error(`Icon outside assets: ${id}`);
    files.set(`public/media/icons/${id}.png`, await readFile(sourcePath));
  }
  files.set(
    "public/media/forest-heroes.png",
    await readFile(path.join(root, "assets/ui/main-menu/forest-heroes.png")),
  );
  await writeGenerated(destination, files);
  console.log(
    `Wiki: ${[...files.keys()].filter((x) => x.endsWith(".md")).length} pages · ${catalog.length} definitions · ${maps.length} maps · balance ${registry.fingerprint}`,
  );
}
async function cli() {
  const mode = process.argv[2] ?? "generate";
  if (!["generate", "dev", "build", "preview"].includes(mode))
    throw new Error(`Unknown wiki command ${mode}`);
  if (mode !== "preview") await generate();
  if (mode === "generate") return;
  const args = [
    path.join(root, "node_modules/vitepress/bin/vitepress.js"),
    mode,
    "wiki",
  ];
  if (mode === "dev" || mode === "preview")
    args.push(
      "--host",
      "127.0.0.1",
      "--port",
      mode === "dev" ? "5174" : "4174",
      "--strictPort",
    );
  const child = spawn(process.execPath, args, { cwd: root, stdio: "inherit" });
  const watchers: ReturnType<typeof watch>[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active = false,
    pending = false;
  const refresh = async () => {
    if (active) {
      pending = true;
      return;
    }
    active = true;
    try {
      await generate();
    } catch (e) {
      console.error(
        "Wiki regeneration failed; fix the source and save again.",
        e,
      );
    } finally {
      active = false;
      if (pending) {
        pending = false;
        void refresh();
      }
    }
  };
  if (mode === "dev")
    for (const dir of [
      "content",
      "docs",
      "assets/maps/showcase",
      "assets/maps/skirmish",
      "assets/ui",
    ])
      watchers.push(
        watch(path.join(root, dir), { recursive: true }, () => {
          clearTimeout(timer);
          timer = setTimeout(() => void refresh(), 180);
        }),
      );
  if (mode === "dev")
    watchers.push(
      watch(root, (_event, name) => {
        if (name && designs.includes(name)) {
          clearTimeout(timer);
          timer = setTimeout(() => void refresh(), 180);
        }
      }),
    );
  const close = () => {
    clearTimeout(timer);
    watchers.forEach((w) => w.close());
  };
  child.on("exit", (code) => {
    close();
    process.exitCode = code ?? 1;
  });
  child.on("error", (e) => {
    close();
    console.error(e);
    process.exitCode = 1;
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, () => {
      close();
      child.kill(signal);
    });
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  void cli().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
