import { describe, expect, it, vi } from "vitest";
import { Session } from "../../src/session/session/session";
import { MapInput } from "../../src/render/input/mapInput";
import { game, worker } from "./helpers";

function setup() {
  const g = game(), unit = worker(g);
  const hud = {
    selectedIds: [unit.id], selected: unit.id as number | null,
    targeting: null as any, mode: null, attackMode: false, rallyMode: false,
    clearMode: vi.fn(), setSelection: vi.fn(), placement:vi.fn(), showError:vi.fn(),
  };
  const session = Object.assign(new Session({} as HTMLCanvasElement,{player:0,mapId:"test",host:{} as HTMLElement,hooks:{onHud:()=>{}}}), {
    worker: {get latest(){const view={size:g.spatial.size,tick:g.state.tick,settlement:g.view("player.1")};return {selection:view,visual:view};},request:vi.fn(async (_method:string,p:any)=>g.canBuild("player.1",p.definition,p.position,p.actor,p.rotation))}, economyHud: hud,
    renderer: {gamePreview:vi.fn(),gameAbilityTarget:vi.fn(), pickWalk: () => ({x:245,z:245}), pickGround: () => ({x: 245, z: 245}), pickGameEntity: () => undefined },
    send: vi.fn(),
  });
  return {g, unit, hud, session:session as any};
}

describe("RTS click intentions", () => {
  it('coalesces placement queries and never paints a stale validation over the current cursor',async()=>{
    const {session,hud,unit}=setup();
    Object.assign(hud,{mode:'building.ants.barracks',targeting:{type:'build',actors:[unit.id]},buildingActor:unit.id,placementRotation:0});
    const replies:((error:string|null)=>void)[]=[];
    session.worker.request.mockImplementation(()=>new Promise(resolve=>replies.push(resolve)));
    session.onHover({clientX:0,clientY:0});
    session.renderer.pickGround=()=>({x:244,z:245});session.onHover({clientX:1,clientY:0});
    expect(session.worker.request).toHaveBeenCalledTimes(1);
    replies[0](null);await vi.waitFor(()=>expect(session.worker.request).toHaveBeenCalledTimes(2));
    expect(session.renderer.gamePreview.mock.calls.some((args:any[])=>args[1]===245&&args[3]===true)).toBe(false);
    replies[1]('Blocked');await vi.waitFor(()=>expect(hud.placement).toHaveBeenCalledWith('Blocked'));
    expect(session.renderer.gamePreview).toHaveBeenLastCalledWith('building.ants.barracks',244,245,false,0,0);
  });
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
          expect(right).toHaveBeenCalledWith(10, 10, false);
          expect(right).toHaveBeenCalledTimes(1);
          expect(camera.panScreen).not.toHaveBeenCalled();
          expect(camera.orbitScreen).not.toHaveBeenCalled();
          pointer("pointerdown", 10, 0); pointer("pointerup", 10, 0);
          expect(left).toHaveBeenCalledWith(10, 10, false, false);
        } else {
          expect(right).not.toHaveBeenCalled();
          expect(camera.orbitScreen).toHaveBeenCalledOnce();
          pointer("pointerdown",10);pointer("pointermove",12);pointer("pointerup",12);
          expect(right).toHaveBeenCalledWith(12,10,false);
          expect(camera.orbitScreen).toHaveBeenCalledOnce();
          right.mockClear();
          pointer("pointerdown",10);pointer("pointercancel",10);pointer("pointerup",10);
          expect(right).not.toHaveBeenCalled();
        }
        input.destroy();
      }
    } finally { vi.unstubAllGlobals(); }
  });
  it("submits the chosen building orientation and validates its preview through the worker", async () => {
    const {session, hud, g, unit} = setup();
    Object.assign(hud, { mode: "building.ants.barracks", targeting: {type: "build", actors: hud.selectedIds}, buildingActor: unit.id, placementRotation: 270 });
    const validate = vi.spyOn(g, "canBuild").mockReturnValue(null);
    session.onHover({clientX:0,clientY:0});await Promise.resolve();
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
