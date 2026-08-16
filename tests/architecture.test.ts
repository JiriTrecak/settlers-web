import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const simRoot = join(repoRoot, "src/sim");

async function walkTs(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walkTs(path)));
    } else if (entry.name.endsWith(".ts")) {
      out.push(path);
    }
  }
  return out;
}

describe("architecture", () => {
  it("sim does not import pixi.js", async () => {
    const files = await walkTs(simRoot);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = await readFile(file, "utf8");
      expect(text, file).not.toMatch(/pixi\.js/);
    }
  });

  it("assets/dat does not import pixi.js", async () => {
    const files = await walkTs(join(repoRoot, "src/assets"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = await readFile(file, "utf8");
      expect(text, file).not.toMatch(/pixi\.js/);
    }
  });
});
