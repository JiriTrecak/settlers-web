import { describe, expect, it, vi } from "vitest";
import { Session } from "../../src/session/session/session";
import { MapInput } from "../../src/render/input/mapInput";
import { game, worker } from "./helpers";

function setup() {
  const g = game(), unit = worker(g);
  const hud = {
    selectedIds: [unit.id], selected: unit.id as number | null,
    targeting: null as any, mode: null, attackMode: false, rallyMode: false,
    clearMode: vi.fn(), setSelection: vi.fn(),
  };
  const session = Object.assign(Object.create(Session.prototype), {
    world: {settlement: g}, me: 0, config: {player: 0}, economyHud: hud,
    renderer: { pickGround: () => ({x: 245, z: 245}), pickGameEntity: () => undefined },
    send: vi.fn(),
  });
  return {g, unit, hud, session};
}

describe("RTS click intentions", () => {
  it("routes right-button gestures to commands in play and retains editor orbit", () => {
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("document", { createElement: () => ({style: {}, remove() {}}), body: {append() {}} });
    try {
      for (const rts of [true, false]) {
        const canvas = Object.assign(new EventTarget(), {clientHeight: 600, setPointerCapture() {}, hasPointerCapture: () => true, releasePointerCapture() {}});
        const camera = {locked: false, panScreen: vi.fn(), orbitScreen: vi.fn()};
        const right = vi.fn(), left = vi.fn();
        const input = new MapInput(canvas as any, camera as any, {rts, orbit: !rts, onChanged() {}, onRightClick: right, onClick: left});
        const pointer = (type: string, x: number, button = 2) => canvas.dispatchEvent(Object.assign(new Event(type), {button, clientX: x, clientY: 10, pointerId: 1, shiftKey: false}));
        pointer("pointerdown", 10); pointer("pointermove", 40); pointer("pointerup", 40);
        expect(left).not.toHaveBeenCalled();
        if (rts) {
          expect(right).toHaveBeenCalledWith(40, 10);
          expect(camera.panScreen).not.toHaveBeenCalled();
          expect(camera.orbitScreen).not.toHaveBeenCalled();
          pointer("pointerdown", 10, 0); pointer("pointerup", 10, 0);
          expect(left).toHaveBeenCalledWith(10, 10, false);
        } else {
          expect(right).not.toHaveBeenCalled();
          expect(camera.orbitScreen).toHaveBeenCalledOnce();
        }
        input.destroy();
      }
    } finally { vi.unstubAllGlobals(); }
  });
  it("submits and validates the chosen building orientation", () => {
    const {session, hud, g, unit} = setup();
    Object.assign(hud, { mode: "building.ants.barracks", targeting: {type: "build", actors: hud.selectedIds}, buildingActor: unit.id, placementRotation: 270 });
    const validate = vi.spyOn(g, "canBuild").mockReturnValue(null);
    session.click(0, 0);
    expect(validate).toHaveBeenCalledWith("player.1", "building.ants.barracks", {x: 245, y: 245}, unit.id, 270);
    expect(session.send).toHaveBeenCalledWith({
      type: "build", actors: [unit.id], definition: "building.ants.barracks",
      position: {x: 245, y: 245}, rotation: 270,
    });
  });
  it("retains all selected workers after placement; Shift retains placement mode too", () => {
    for (const shift of [false, true]) {
      const {session, hud, g, unit} = setup();
      const workers = g.entities.filter(e => e.definition === "unit.ants.settler").slice(0, 3).map(e => e.id);
      hud.selectedIds = workers;
      Object.assign(hud, {mode: "building.ants.barracks", targeting: {type: "build", actors: hud.selectedIds}, buildingActor: unit.id, placementRotation: 0});
      session.renderer.pickGround = () => ({x: 205, z: 210});
      session.click(0, 0, shift);
      const action = session.send.mock.calls[0][0];
      expect(g.command("player.1", action).accepted).toBe(true);
      g.observation.update();
      expect(hud.selectedIds).toEqual(workers);
      expect(hud.setSelection).not.toHaveBeenCalled();
      expect(hud.clearMode).toHaveBeenCalledTimes(shift ? 0 : 1);
    }
  });
  it("left ground clears selection, right ground moves without clearing it", () => {
    const {session, hud, unit} = setup();
    session.click(0, 0);
    expect(session.send).not.toHaveBeenCalled();
    expect(hud.selected).toBeNull();
    hud.selected = unit.id;
    session.click(0, 0, false, true);
    expect(session.send).toHaveBeenCalledWith({type: "move", actors: [unit.id], destination: {x: 245, y: 245}});
    expect(hud.selected).toBe(unit.id);
  });
  it("right click cancels explicit targeting without issuing an order", () => {
    const {session, hud} = setup();
    hud.targeting = {type: "build"};
    session.click(0, 0, false, true);
    expect(hud.clearMode).toHaveBeenCalledOnce();
    expect(session.send).not.toHaveBeenCalled();
  });
  it("left click still confirms explicit Move targeting", () => {
    const {session, hud, unit} = setup();
    hud.targeting = {type: "move", actors: [unit.id]};
    session.click(0, 0);
    expect(session.send).toHaveBeenCalledWith({type: "move", actors: [unit.id], destination: {x: 245, y: 245}});
    expect(hud.clearMode).toHaveBeenCalledOnce();
  });
  it("left click inspects enemies; right click orders the selected army to attack", () => {
    const {session, hud, g} = setup();
    const own = g.entities.find(e => e.owner === "player.1" && e.definition === "unit.ants.warrior")!;
    const enemy = g.entities.find(e => e.owner === "player.2" && e.definition === "unit.ants.warrior")!;
    enemy.x = own.x + 1; enemy.y = own.y;
    // Refresh authoritative visibility after placing the enemy within friendly sight.
    g.tick();
    hud.selectedIds = [own.id]; hud.selected = own.id;
    session.renderer.pickGameEntity = () => enemy.id;
    session.click(0, 0);
    expect(hud.selected).toBe(enemy.id);
    expect(session.send).not.toHaveBeenCalled();
    hud.selected = own.id;
    session.click(0, 0, false, true);
    expect(session.send).toHaveBeenCalledWith({type: "attack", actors: [own.id], target: enemy.id});
    expect(hud.selected).toBe(own.id);
  });
});
