/** LoadWatch unique-path counting for the match-start overlay. */
import { describe, expect, it } from "vitest";
import { LoadWatch } from "../../src/render/graphics/loadWatch";

describe("LoadWatch", () => {
  it("counts unique in-flight then loaded paths", () => {
    const views: { done: number; total: number; detail: string }[] = [];
    const watch = new LoadWatch((v) => views.push({ done: v.done, total: v.total, detail: v.detail }));
    watch.setStage("Graphics", "catalog.json");
    watch.expectPath("a.png");
    watch.expectPath("b.png");
    watch.expectPath("a.png");
    watch.tick("a.png");
    expect(watch.view()).toMatchObject({
      stage: "Graphics",
      detail: "catalog.json",
      done: 1,
      total: 2,
      last: "a.png",
    });
    watch.note("settlers · lumberjack");
    watch.tick("b.png");
    expect(watch.view()).toMatchObject({ done: 2, total: 2, detail: "settlers · lumberjack", last: "b.png" });
    expect(views.length).toBeGreaterThan(3);
  });

  it("run restores the previous watch", async () => {
    const a = new LoadWatch(() => {});
    const b = new LoadWatch(() => {});
    await a.run(async () => {
      a.expectPath("x.png");
      await b.run(async () => {
        b.expectPath("y.png");
        expect(b.view().total).toBe(1);
      });
      a.tick("x.png");
      expect(a.view()).toMatchObject({ done: 1, total: 1 });
    });
  });
});
