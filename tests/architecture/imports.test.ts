import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const TEXT = /\.(ts|mjs|md)$/;
const SKIP = new Set(["node_modules", "assets", "dist"]);

async function walk(dir: string, pred: (name: string) => boolean): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP.has(entry.name) || entry.name.startsWith(".")) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path, pred)));
    else if (pred(entry.name)) out.push(path);
  }
  return out;
}

async function walkTs(dir: string): Promise<string[]> {
  return walk(dir, (name) => name.endsWith(".ts"));
}

describe("architecture", () => {
  it("sim does not import pixi.js", async () => {
    const files = await walkTs(join(repoRoot, "src/sim"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = await readFile(file, "utf8");
      expect(text, file).not.toMatch(/pixi\.js/);
    }
  });

  it("src does not import original_conv", async () => {
    const files = await walkTs(join(repoRoot, "src"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = await readFile(file, "utf8");
      expect(text, file).not.toMatch(/from\s+["'][^"']*original_conv/);
    }
  });

  it("does not mention a foreign engine in our sources", async () => {
    const files = await walk(repoRoot, (name) => TEXT.test(name));
    expect(files.length).toBeGreaterThan(0);
    const a = "a";
    const banned = new RegExp(`\\bJav${a}\\b|jsettler${"s"}|SettlersJav${a}`);
    for (const file of files) {
      const text = await readFile(file, "utf8");
      expect(text, file).not.toMatch(banned);
    }
  });
});
