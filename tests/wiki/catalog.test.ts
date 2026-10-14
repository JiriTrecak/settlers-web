import { describe, it, expect } from "vitest";
import { readFile, mkdtemp, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AuthoredDefinition } from "../../src/content/schema";
import { testSource } from "../fixtures/content";
import {
  buildCatalog,
  definitionPath,
  seconds,
} from "../../scripts/wiki/catalog";
import { writeGenerated } from "../../scripts/wiki/generate";

const ARCHER = "unit.test.archer", WORKER = "unit.test.settler";
const page = (result: ReturnType<typeof buildCatalog>, id: string) =>
  result.files.get(`${definitionPath(result.registry.get(id))}.md`);

describe("generated game wiki", () => {
  it("publishes a page for every expanded definition and converts ticks to seconds", () => {
    const result = buildCatalog(testSource());
    expect(result.registry.definitions.length).toBeGreaterThan(0);
    for (const d of result.registry.definitions)
      expect(result.files.has(`${definitionPath(d)}.md`), d.id).toBe(true);
    // 40 simulation ticks per second.
    expect(seconds(400)).toBe("10 s");
  });
  it("balance and inherited behavior edits update output, without a hand-maintained wiki table", () => {
    const edited = testSource();
    const definitions = edited.definitions as AuthoredDefinition[];
    const archer = definitions.find((d) => d.id === ARCHER)!;
    archer.body!.maxHp = 87;
    archer.creation!.items.find((p) => p.item === "item.test.wood")!.amount = 7;
    // The worker's cargo capacity is inherited from its behavior set.
    const worker = definitions.find((d) => d.id === WORKER)!;
    const workerSet = (edited.behaviorSets as { id: string; behaviors: { work?: { carryCapacity: number } } }[])
      .find((s) => worker.behaviorSets?.includes(s.id) && s.behaviors.work)!;
    workerSet.behaviors.work!.carryCapacity = 16;
    const result = buildCatalog(edited);
    expect(page(result, ARCHER)).toContain("| Health | 87 |");
    expect(page(result, ARCHER)).toContain("7 [Wood]");
    expect(page(result, WORKER)).toContain("| Cargo capacity | 16 |");
  });
  it("rejects broken registry references before publication", () => {
    const edited = testSource();
    (edited.definitions as AuthoredDefinition[]).find((d) => d.id === ARCHER)!.creation!.items[0]!.item = "item.missing";
    expect(() => buildCatalog(edited)).toThrow();
  });
  it("keeps currencies out of hero item pages and states exact loot semantics", () => {
    // Exercise plural rolls and weighted odds with a test-defined pool.
    const fixture = testSource();
    const rules = fixture.rules as { lootPools: Record<string, unknown> };
    for (const id of Object.keys(rules.lootPools)) delete rules.lootPools[id];
    rules.lootPools["loot.test.camp-easy"] = {
      rolls: 2, maxTier: 1,
      entries: [{item: "item.test.barkguard", weight: 35}, {item: "item.test.resin-salve", weight: 65}],
    };
    const { catalog, files } = buildCatalog(fixture);
    expect(catalog.find((d) => d.id === "item.test.amber")!.section).toBe("resources");
    expect(catalog.find((d) => d.id === "item.test.barkguard")!.section).toBe("items");
    expect(files.get("guide/loot.md")).toContain("with replacement");
    expect(files.get("guide/loot.md")).toContain("**2 rolls per cleared camp.**");
    expect(files.get("guide/loot.md")).toContain("35%");
  });
  it("cleans only its own obsolete generated files", async () => {
    const out = await mkdtemp(path.join(tmpdir(), "canopy-wiki-"));
    try {
      await writeGenerated(
        out,
        new Map([
          ["old.md", "old"],
          ["keep.md", "original"],
        ]),
      );
      await writeFile(path.join(out, "personal.md"), "do not touch");
      await writeGenerated(out, new Map([["keep.md", "updated"]]));
      expect(await readdir(out)).not.toContain("old.md");
      expect(await readFile(path.join(out, "personal.md"), "utf8")).toBe(
        "do not touch",
      );
      expect(await readFile(path.join(out, "keep.md"), "utf8")).toBe("updated");
      await expect(
        writeGenerated(out, new Map([["../escape.md", "bad"]])),
      ).rejects.toThrow("Unsafe");
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });
});
