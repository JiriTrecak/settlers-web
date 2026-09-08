import { afterEach, describe, expect, it, vi } from "vitest";
import { MapInput } from "../../src/render/input/mapInput";

function setup(rts = true) {
  const win = new EventTarget();
  const doc = {
    hidden: false, hasFocus: () => true, querySelector: vi.fn((): unknown => null),
    createElement: () => ({style: {}, remove() {}}), body: {append() {}},
  };
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  const canvas = Object.assign(new EventTarget(), {
    // Offset viewport and large drawing buffer verify CSS bounds, not resolution, drive scrolling.
    width: 3200, height: 2400,
    getBoundingClientRect: () => ({left: 100, top: 80, right: 900, bottom: 680}),
  });
  const camera = { panWorld: vi.fn() };
  const changed = vi.fn();
  const input = new MapInput(canvas as any, camera as any, {rts, onChanged: changed});
  const move = (x: number, y: number, pointerType = "mouse") => win.dispatchEvent(Object.assign(new Event("pointermove"), {clientX: x, clientY: y, pointerType}));
  return {input, camera, changed, move, win, doc};
}

afterEach(() => vi.unstubAllGlobals());

describe("RTS edge scrolling", () => {
  it("pans from all four CSS viewport edges and keeps diagonal speed constant", () => {
    const {input, camera, move} = setup();
    for (const [x, y, right, forward] of [[101, 300, -1, 0], [899, 300, 1, 0], [400, 81, 0, 1], [400, 679, 0, -1]]) {
      move(x, y); input.tick(50);
      const [r, f] = camera.panWorld.mock.calls.at(-1)!;
      expect(r).toBeCloseTo(right * 1.4); expect(f).toBeCloseTo(forward * 1.4);
    }
    move(899, 81); input.tick(50);
    const [r, f] = camera.panWorld.mock.calls.at(-1)!;
    expect(r).toBeGreaterThan(0); expect(f).toBeGreaterThan(0);
    expect(Math.hypot(r, f)).toBeCloseTo(1.4);
    input.destroy();
  });

  it("stops in the center, outside the viewport, on blur and after leaving the window", () => {
    const {input, camera, move, win} = setup();
    move(101, 300); input.tick(16); expect(camera.panWorld).toHaveBeenCalledOnce();
    camera.panWorld.mockClear();
    move(400, 300); input.tick(16);
    move(99, 300); input.tick(16);
    move(101, 300); win.dispatchEvent(new Event("blur")); input.tick(16);
    move(101, 300); win.dispatchEvent(Object.assign(new Event("pointerout"), {relatedTarget: null})); input.tick(16);
    expect(camera.panWorld).not.toHaveBeenCalled();
    input.destroy();
  });

  it("does not scroll behind dialogs or while hidden, unfocused, touching, or destroyed", () => {
    const {input, camera, move, doc} = setup();
    doc.querySelector.mockReturnValue({}); move(101, 300); input.tick(16);
    doc.querySelector.mockReturnValue(null); input.tick(16);
    doc.hidden = true; move(101, 300); input.tick(16); doc.hidden = false;
    doc.hasFocus = () => false; move(101, 300); input.tick(16); doc.hasFocus = () => true;
    move(101, 300, "touch"); input.tick(16);
    expect(camera.panWorld).not.toHaveBeenCalled();
    input.destroy(); move(101, 300); input.tick(16);
    expect(camera.panWorld).not.toHaveBeenCalled();
  });

  it("leaves editor hover behavior unchanged", () => {
    const {input, camera, move} = setup(false);
    move(101, 300); input.tick(50);
    expect(camera.panWorld).not.toHaveBeenCalled();
    input.destroy();
  });
});
