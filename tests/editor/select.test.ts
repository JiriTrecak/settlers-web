import { describe, expect, it } from "vitest";
import { nearestStamp, SelectTool, withPose, wrapYaw } from "../../src/editor/select/select";

describe("select", () => {
  it("picks the nearest stamp in range", () => {
    const stamps = [
      { id: "a", asset: "pine", x: 10, y: 10 },
      { id: "b", asset: "pine", x: 12, y: 10 },
    ];
    expect(nearestStamp(stamps, 10.4, 10.4)?.id).toBe("a");
    expect(nearestStamp(stamps, 20, 20)).toBeNull();
  });

  it("moves on drag and yaws on shift-drag", () => {
    const tool = new SelectTool();
    const stamp = { id: "b", asset: "bridge-16", x: 8, y: 4, yaw: 0 };
    tool.begin(stamp, { x: 14, z: 5 }, false);
    expect(tool.drag({ x: 14, z: 5 })).toEqual({ x: 8, y: 4, yaw: 0 });
    expect(tool.drag({ x: 16, z: 6 })).toEqual({ x: 10, y: 5, yaw: 0 });
    tool.begin(stamp, { x: 10.5, z: 4.5 }, true);
    const rot = tool.drag({ x: 8.5, z: 2.5 });
    expect(rot?.x).toBe(8);
    expect(rot?.y).toBe(4);
    expect(rot?.yaw).toBeCloseTo(Math.PI / 2, 5);
  });

  it("keeps scale and drops zero yaw", () => {
    const s = { id: "a", asset: "pine", x: 1, y: 2, scale: 1.4, yaw: 0.4 };
    const next = withPose(s, 3, 4, 0);
    expect(next).toEqual({ id: "a", asset: "pine", x: 3, y: 4, scale: 1.4 });
    expect(wrapYaw(-Math.PI / 2)).toBeCloseTo((3 * Math.PI) / 2, 5);
  });
});
