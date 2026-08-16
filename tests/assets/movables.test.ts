import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { clipPath, framesOf, loadAllMovableClips, parseMovablesText } from "../../src/assets/catalog/movables";

const dir = join(dirname(fileURLToPath(import.meta.url)), "../../src/assets/catalog/movables");

describe("movables", () => {
  it("expands SETTLER_MATERIAL into walk + idle per civ", () => {
    const clips = parseMovablesText(
      `
!SETTLER_ACTION type action mat file seq {
$type, $action, $mat, SOUTH_WEST = $file, $seq,  1, 11
$type, $action, $mat, EAST       = $file, $seq, 49, 11
}
!SETTLER_MATERIAL type mat file seq {
SETTLER_ACTION($type, WALKING, $mat, $file, $seq)
$type, NO_ACTION, $mat, SOUTH_WEST = $file, $seq,  0, 1
}
SETTLER_MATERIAL(BEARER, STONE, c0, 2)
`,
      null,
    );
    expect(clips.some((c) => c.civ === "roman" && c.file === 10 && c.action === "WALKING" && c.sequence === 2)).toBe(true);
    expect(clips.some((c) => c.civ === "amazon" && c.file === 40 && c.action === "NO_ACTION")).toBe(true);
    const walk = clips.find((c) => c.civ === "roman" && c.action === "WALKING" && c.direction === "EAST")!;
    expect(framesOf(walk)).toEqual(Array.from({ length: 11 }, (_, i) => 49 + i));
    expect(clipPath(walk)).toBe("settlers/roman/bearer/walk/stone/e");
  });

  it("reverses negative duration", () => {
    expect(framesOf({ civ: "roman", type: "X", action: "RAISE_UP", material: "*", direction: "EAST", file: 10, sequence: 0, start: 3, duration: -4 })).toEqual([
      3, 2, 1, 0,
    ]);
  });

  it("loads the real naming files", async () => {
    const clips = await loadAllMovableClips(dir);
    expect(clips.length).toBeGreaterThan(1000);
    expect(clips.some((c) => c.type === "BEARER" && c.civ === "roman" && c.material === "STONE")).toBe(true);
    expect(clips.some((c) => c.type === "DONKEY" && c.civ === "shared")).toBe(true);
  });
});
