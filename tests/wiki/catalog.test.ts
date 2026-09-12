import { describe, it, expect } from "vitest";
import { readFile, mkdtemp, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import raw from "../../content/game.json";
import {renderAssets} from "../../src/shared/assets/manifest";
const source={...raw,assets:renderAssets};
import {
  buildCatalog,
  definitionPath,
  seconds,
} from "../../scripts/wiki/catalog";
import { writeGenerated } from "../../scripts/wiki/generate";

describe("generated game wiki", () => {
  it("publishes every expanded definition, linked prices, birth intervals and hero levels", () => {
    const result = buildCatalog(structuredClone(source));
    for (const d of result.registry.definitions)
      expect(result.files.has(`${definitionPath(d)}.md`), d.id).toBe(true);
    expect(result.files.get("units/unit-ants-settler.md")).toContain(
      "| Cargo capacity | 10 |",
    );
    expect(result.files.get("units/unit-ants-settler.md")).toContain(
      "building-ants-house",
    );
    expect(result.files.get("buildings/building-ants-fort.md")).toContain(
      "| Birth interval | 12 s |",
    );
    expect(result.files.get("buildings/building-ants-house.md")).toContain(
      "| Birth interval | 20 s |",
    );
    expect(result.files.get("units/unit-ants-archer.md")).toContain(
      "1 available [Worker]",
    );
    expect(result.files.get("units/unit-ants-marshal.md")).toContain(
      "| 10 | 3200 | 1375 | 58 | 6 |",
    );
    expect(seconds(400)).toBe("10 s");
  });
  it("balance and inherited behavior edits update output, without a hand-maintained wiki table", () => {
    const edited = structuredClone(source);
    const archer = edited.definitions.find((d) => d.id === "unit.ants.archer")!;
    archer.body!.maxHp = 87;
    archer.creation!.items.find(p=>p.item === "item.wood")!.amount = 7;
    const workerSet = edited.behaviorSets.find(
      (s) => s.id === "behavior-set.worker",
    )!;
    workerSet.behaviors.work!.carryCapacity = 16;
    const { files } = buildCatalog(edited);
    expect(files.get("units/unit-ants-archer.md")).toContain("| Health | 87 |");
    expect(files.get("units/unit-ants-archer.md")).toContain("7 [Wood]");
    expect(files.get("units/unit-ants-settler.md")).toContain(
      "| Cargo capacity | 16 |",
    );
  });
  it("rejects broken registry references before publication", () => {
    const edited = structuredClone(source);
    edited.definitions.find(
      (d) => d.id === "unit.ants.archer",
    )!.creation!.items[0].item = "item.missing";
    expect(() => buildCatalog(edited)).toThrow();
  });
  it("keeps currencies out of hero item pages and states exact loot semantics", () => {
    // Exercise plural rolls and weighted odds independently of live balance edits.
    const fixture = structuredClone(source);
    fixture.rules.lootPools["loot.camp.easy"] = {
      rolls: 2, maxTier: 1,
      entries: [{item: "item.barkguard", weight: 35}, {item: "item.resin-salve", weight: 65}],
    };
    const { catalog, files } = buildCatalog(fixture);
    expect(catalog.find((d) => d.id === "item.amber")!.section).toBe(
      "resources",
    );
    expect(catalog.find((d) => d.id === "item.barkguard")!.section).toBe(
      "items",
    );
    expect(files.get("guide/loot.md")).toContain("with replacement");
    expect(files.get("guide/loot.md")).toContain(
      "**2 rolls per cleared camp.**",
    );
    expect(files.get("guide/loot.md")).toContain("35%");
  });
  it("keeps planned faction pages explicit about availability", async () => {
    for (const name of ["beetles", "bees"]) {
      const page = await readFile(`docs/wiki/factions/${name}.md`, "utf8");
      expect(page).toContain("Planned faction");
      expect(page).not.toMatch(/\| Health \|/);
    }
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
