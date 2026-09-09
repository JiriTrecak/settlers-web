import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { content } from "../../src/content/builtin";
import { iconArt } from "../../src/ui/settlement/commandArt";

describe("declared interface artwork", () => {
  it("resolves every icon to a square PNG no larger than 128 pixels", () => {
    for (const asset of content.assets.filter((a) => a.id.startsWith("icon."))) {
      expect(asset.image, asset.id).toBeTruthy();
      const png = readFileSync(resolve(asset.image!));
      expect(png.toString("hex", 0, 8)).toBe("89504e470d0a1a0a");
      const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
      expect(width, asset.id).toBeGreaterThan(0);
      expect(width, asset.id).toBeLessThanOrEqual(128);
      expect(height, asset.id).toBe(width);
      const html = iconArt(asset.id);
      expect(html).toContain("background-image:");
      expect(html).not.toContain("<svg");
      expect(html).not.toContain("background-position:");
    }
  });
  it("keeps basic/advanced build and raw/processed timber distinct", () => {
    expect(content.actions.categories["category.build"].icon).toBe("icon.action.build");
    expect(content.actions.categories["category.build-advanced"].icon).toBe("icon.action.build-advanced");
    expect(content.asset("icon.item.wood").image).not.toBe(content.asset("icon.item.plank").image);
  });
});
