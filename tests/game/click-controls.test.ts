import { describe, expect, it, vi } from "vitest";
import { Session } from "../../src/session/session/session";
import { MapInput } from "../../src/render/input/mapInput";
import { content, builtinSource } from "../../src/content/builtin";
import { ContentRegistry } from "../../src/content/registry";
import type { Rules } from "../../src/content/schema";
import { emptyUtcMap } from "../../src/shared/map/utcmap";
import { snapPlacement } from "../../src/shared/spatial/placement";
import { Game } from "../../src/sim/game/game";
import { slots, worker } from "./helpers";

// ENGINE-COUPLED: Session resolves definitions through the global shipped `content`, so these client-intent tests run
// on shipped content and pick every definition generically (no shipped ids are named).
function shippedGame() {
  const source = structuredClone(builtinSource);
  (source.rules as Rules).startingSetup.gathering = [];
  return new Game({...emptyUtcMap(), entities: []}, slots, new ContentRegistry(source));
}
/** The smallest building the starting worker can construct. */
const buildable = (g: Game) => content.get(worker(g).definition).behaviors.work!.builds
  .filter(id => content.get(id).kind === "building" && content.get(id).footprint)
  .sort((a, b) => { const fa = content.get(a).footprint!, fb = content.get(b).footprint!; return fa.width * fa.depth - fb.width * fb.depth || (a < b ? -1 : 1); })[0]!;
const snapped = (definition: string, x: number, y: number, rotation = 0) => snapPlacement(content.get(definition), {x, y}, rotation);

function setup() {
  const g = shippedGame(), unit = worker(g), building = buildable(g);
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
  return {g, unit, hud, building, session:session as any};
}

describe("RTS click intentions", () => {
  it('coalesces placement queries and never paints a stale validation over the current cursor',async()=>{
    const {session,hud,unit,building}=setup();
    Object.assign(hud,{mode:building,targeting:{type:'build',actors:[unit.id]},buildingActor:unit.id,placementRotation:0});
    const replies:((error:string|null)=>void)[]=[];
    session.worker.request.mockImplementation(()=>new Promise(resolve=>replies.push(resolve)));
    session.onHover({clientX:0,clientY:0});
    session.renderer.pickGround=()=>({x:240,z:245});session.onHover({clientX:1,clientY:0});
    expect(session.worker.request).toHaveBeenCalledTimes(1);
    replies[0](null);await vi.waitFor(()=>expect(session.worker.request).toHaveBeenCalledTimes(2));
    expect(session.renderer.gamePreview.mock.calls.some((args:any[])=>args[1]===snapped(building,245,245).x&&args[3]===true)).toBe(false);
    replies[1]('Blocked');await vi.waitFor(()=>expect(hud.placement).toHaveBeenCalledWith('Blocked'));
    expect(session.renderer.gamePreview).toHaveBeenLastCalledWith(building,snapped(building,240,245).x,snapped(building,240,245).y,false,0,0);
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
    const {session, hud, g, unit, building} = setup(), position = snapped(building, 245, 245, 270);
    Object.assign(hud, { mode: building, targeting: {type: "build", actors: hud.selectedIds}, buildingActor: unit.id, placementRotation: 270 });
    const validate = vi.spyOn(g, "canBuild").mockReturnValue(null);
    session.onHover({clientX:0,clientY:0});await Promise.resolve();
    session.click(0, 0);
    expect(validate).toHaveBeenCalledWith("player.1", building, position, unit.id, 270);
    expect(session.send).toHaveBeenCalledWith({
      type: "build", actors: [unit.id], definition: building,
      position, rotation: 270,
    });
  });
  it("retains all selected workers after placement; Shift retains placement mode too", () => {
    for (const shift of [false, true]) {
      const {session, hud, g, unit, building} = setup();
      const workers = g.entities.filter(e => e.definition === unit.definition).slice(0, 3).map(e => e.id);
      hud.selectedIds = workers;
      Object.assign(hud, {mode: building, targeting: {type: "build", actors: hud.selectedIds}, buildingActor: unit.id, placementRotation: 0});
      // This test covers selection intent; terrain exploration has separate placement coverage.
      vi.spyOn(g.observation, 'explored').mockReturnValue(true);
      session.renderer.pickGround = () => ({x: 190, z: 230});
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
  for (const shift of [false,true]) it(`right-click ${shift?'queues':'issues'} construction resumption on an owned foundation`,()=>{
    const {session,g,unit,building}=setup();
    expect(g.command('player.1',{type:'build',actors:[unit.id],definition:building,position:snapped(building,235,239)}).accepted).toBe(true);
    const site=g.entities.find(e=>e.construction)!;g.observation.update();
    session.renderer.pickGameEntity=()=>site.id;
    session.click(0,0,shift,true);
    expect(session.send).toHaveBeenCalledWith({type:'construct',actors:[unit.id],target:site.id,...(shift?{append:true}:{})});
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
    const own = g.entities.find(e => e.owner === "player.1" && content.get(e.definition).hero)!;
    const enemy = g.entities.find(e => e.owner === "player.2" && content.get(e.definition).hero)!;
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
