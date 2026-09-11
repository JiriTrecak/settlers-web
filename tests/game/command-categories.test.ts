import { describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/registry";
import { commandCard, commandMenu, commandPage, commandPageCount, shortcutCommand } from "../../src/presentation/commands";
import { game, source, worker } from "./helpers";

describe("command categories", () => {
  it("discovers only populated worker menus and preserves concrete build intentions", () => {
    const g = game(), w = worker(g);
    const bindings = commandCard(g.view("player.1"), [w.id], "player.1", g.registry);
    const root = commandMenu(bindings, null, g.registry).entries;
    expect(root.map(b => b.id)).toEqual(["move", "stop", "hold", "patrol", "follow", "category:category.build", "category:category.build-advanced"]);
    expect(shortcutCommand(root, 0, "b")?.type).toBe("category");
    expect(commandMenu(bindings, "category.build-advanced", g.registry).entries.find(b => b.targetDefinition === "building.ants.bombardier-workshop")).toMatchObject({enabled: false, reason: "Requires Great Mound"});
    const basic = commandMenu(bindings, "category.build", g.registry).entries;
    expect(basic.filter(b => b.type === "build").map(b => b.targetDefinition)).toEqual(
      ["house", "barracks", "sanctuary", "ironroot-forge", "rootworks"].map(id => `building.ants.${id}`),
    );
    expect(bindings.some(b => ["building.ants.forester", "building.ants.tower"].includes(b.targetDefinition ?? ""))).toBe(false);
    const barracks = basic.find(b => b.targetDefinition === "building.ants.barracks")!;
    expect(barracks.actors).toEqual([w.id]);
    expect(barracks.costs.map(c => c.amount)).toEqual([160, 60]);
    expect(commandPage(basic, 0).find(s => s.binding.type === "back")).toMatchObject({column: 1, row: 3, binding: {destination: null}});
    const soldier = g.entities.find(e => e.definition === "unit.ants.warrior")!;
    const army = commandCard(g.view("player.1"), [soldier.id], "player.1", g.registry);
    expect(commandMenu(army, "category.build", g.registry).category).toBeNull();
    expect(commandMenu(army, null, g.registry).entries.some(b => b.type === "category")).toBe(false);
    expect(commandMenu([], null, g.registry).entries).toEqual([]);
  });

  it("supports nested categories, explicit ungrouping, and command-specific overrides", () => {
    const s = source() as any;
    s.actions.categories["category.build-advanced"].parent = "category.build";
    s.actions.overrides["build:building.ants.tower"].hidden = false;
    s.actions.overrides["build:building.ants.house"] = {category: null};
    s.actions.overrides["build:building.ants.barracks"] = {category: "category.build"};
    const registry = new ContentRegistry(s), g = game();
    const bindings = commandCard(g.view("player.1"), [worker(g).id], "player.1", registry);
    expect(commandMenu(bindings, null, registry).entries.map(b => b.id)).toContain("build:building.ants.house");
    const basic = commandMenu(bindings, "category.build", registry).entries;
    expect(basic.map(b => b.id)).toContain("category:category.build-advanced");
    expect(basic.map(b => b.id)).toContain("build:building.ants.barracks");
    expect(commandMenu(bindings, "category.build-advanced", registry).entries.find(b => b.type === "back")).toMatchObject({destination: "category.build"});
  });

  it("keeps Back reachable on every full page and scopes shortcuts to visible entries", () => {
    const g = game();
    const seed = commandCard(g.view("player.1"), [worker(g).id], "player.1", g.registry).find(b => b.type === "build")!;
    const bindings = Array.from({length: 23}, (_, i) => ({...seed, id: `test:${String(i).padStart(2, "0")}`, category: "category.build", hotkey: i === 22 ? "Z" : undefined}));
    const menu = commandMenu(bindings, "category.build", g.registry).entries;
    expect(commandPageCount(menu)).toBe(3);
    const pages = [0, 1, 2].map(i => commandPage(menu, i));
    expect(pages.map(p => p.length)).toEqual([12, 12, 2]);
    for (const page of pages) expect(page.at(-1)).toMatchObject({column: 1, row: 3, binding: {type: "back"}});
    expect(shortcutCommand(menu, 0, "z")).toBeUndefined();
    expect(shortcutCommand(menu, 2, "z")?.id).toBe("test:22");
    expect(new Set(pages.flatMap(p => p.filter(s => s.binding.type !== "back").map(s => s.binding.id))).size).toBe(23);
  });

  it("fills left-to-right, skips slot 9 for Back and reads its shortcut from content", () => {
    const s = source() as any;
    s.actions.navigation.back.hotkey = "Q";
    s.actions.navigation.back.description = "Return one level";
    const registry = new ContentRegistry(s), g = game();
    const seed = commandCard(g.view("player.1"), [worker(g).id], "player.1", registry).find(b => b.type === "build")!;
    const root = Array.from({length: 12}, (_, i) => ({...seed, id: String(i), category: undefined}));
    expect(commandPage(root, 0).map(s => (s.row - 1) * 4 + s.column)).toEqual([1,2,3,4,5,6,7,8,9,10,11,12]);
    const menu = commandMenu(root.map(b => ({...b, category: "category.build"})), "category.build", registry).entries;
    expect(commandPage(menu, 0).map(s => (s.row - 1) * 4 + s.column)).toEqual([1,2,3,4,5,6,7,8,10,11,12,9]);
    expect(shortcutCommand(menu, 0, "q")).toMatchObject({type: "back", hotkey: "Q", description: "Return one level"});
    expect(shortcutCommand(menu, 0, "Escape")).toBeUndefined();
    const defaults = commandMenu(root.map(b => ({...b, category: "category.build"})), "category.build", g.registry).entries;
    expect(shortcutCommand(defaults, 0, "Escape")).toMatchObject({type: "back", hotkey: "Escape"});
  });

  it("rejects missing references, cycles, invalid icons and ambiguous shortcuts", () => {
    for (const edit of [
      (s: any) => {s.actions.actions.build.category = "category.missing";},
      (s: any) => {s.definitions[0].category = "category.missing";},
      (s: any) => {s.actions.overrides["build:building.ants.house"] = {category: "category.missing"};},
      (s: any) => {s.actions.categories["category.build"].parent = "category.build-advanced"; s.actions.categories["category.build-advanced"].parent = "category.build";},
      (s: any) => {s.actions.categories["category.build"].icon = "asset.ants.warrior";},
      (s: any) => {s.actions.categories["category.build"].hotkey = "A";},
    ]) {
      const s = source(); edit(s);
      expect(() => new ContentRegistry(s)).toThrow();
    }
  });
});

 it('keeps unlearned spells hidden and the skill banner outside all twelve slots',()=>{
  const g=game(),hero=g.entities.find(e=>e.owner==='player.1'&&e.spellcasting)!;
  const read=()=>commandCard(g.view('player.1'),[hero.id],'player.1',g.registry);
  let card=read();expect(card.filter(b=>b.type==='cast')).toHaveLength(0);
  const root=commandMenu(card,null,g.registry).entries,slots=commandPage(root,0);
  expect(slots.filter(s=>s.row===1).map(s=>s.binding.type)).toEqual(['move','attack','stop','hold']);
  expect(slots.find(s=>s.binding.placement==='banner')).toMatchObject({row:4,column:1,binding:{name:'New spell available',hotkey:'K'}});
  expect(shortcutCommand(root,0,'k')?.type).toBe('category');
  expect(g.spells.learn(hero,'spell.marshal.faultline')).toBeNull();g.tick();card=read();
  expect(card.filter(b=>b.type==='cast').map(b=>b.ability)).toEqual(['spell.marshal.faultline']);
  expect(commandMenu(card,null,g.registry).entries.some(b=>b.placement==='banner')).toBe(false);
  expect(commandPage(commandMenu(card,null,g.registry).entries,0).find(s=>s.binding.type==='cast')).toMatchObject({row:3,column:1});
  expect(commandMenu(card,'category.hero.skills',g.registry).category).toBeNull();
 });
 it('does not let a banner consume a paginated grid slot',()=>{
  const g=game(),seed=commandCard(g.view('player.1'),[worker(g).id],'player.1',g.registry)[0];
  const entries=[...Array.from({length:12},(_,i)=>({...seed,id:String(i)})),{...seed,id:'banner',placement:'banner' as const}];
  expect(commandPageCount(entries)).toBe(1);expect(commandPage(entries,0)).toHaveLength(13);
  expect(commandPage(entries,0).filter(s=>s.row<=3)).toHaveLength(12);
 });

it('keeps all learned abilities on the bottom row independently of movement commands',()=>{
  const g=game(),hero=g.entities.find(e=>e.owner==='player.1'&&e.spellcasting)!;
  hero.progression!.experience=3200;
  const abilities=g.context.def(hero).behaviors.spellcasting!.abilities;
  for(const ability of abilities)expect(g.spells.learn(hero,ability)).toBeNull();
  g.observation.update();
  const root=commandMenu(commandCard(g.view('player.1'),[hero.id],'player.1',g.registry),null,g.registry).entries;
  const slots=commandPage(root,0);
  expect(slots.filter(s=>s.row===3).map(s=>s.binding.ability)).toEqual(abilities);
  expect(slots.filter(s=>s.row===3).map(s=>s.column)).toEqual([1,2,3,4]);
  expect(slots.find(s=>s.binding.placement==='banner')?.row).toBe(4);
  expect(slots.filter(s=>s.binding.type==='move'||s.binding.type==='follow').every(s=>s.row<3)).toBe(true);
});

it('preserves declared ability columns when only skills one and three are learned',()=>{
  const g=game(),hero=g.entities.find(e=>e.owner==='player.1'&&e.spellcasting)!;
  hero.progression!.experience=100;
  for(const id of ['spell.marshal.faultline','spell.marshal.carapace'])expect(g.spells.learn(hero,id)).toBeNull();
  g.observation.update();
  const menu=commandMenu(commandCard(g.view('player.1'),[hero.id],'player.1',g.registry),null,g.registry);
  const abilities=commandPage(menu.entries,0).filter(s=>s.binding.type==='cast');
  expect(abilities.map(s=>({id:s.binding.ability,row:s.row,column:s.column}))).toEqual([
    {id:'spell.marshal.faultline',row:3,column:1},
    {id:'spell.marshal.carapace',row:3,column:3},
  ]);
  expect(shortcutCommand(menu.entries,0,'e')?.ability).toBe('spell.marshal.carapace');
});
it('rejects overlapping and out-of-range declared ability columns',()=>{
  const s=source() as any;s.rules.spells['spell.marshal.carapace'].column=1;
  expect(()=>new ContentRegistry(s)).toThrow(/duplicate ability column/);
  s.rules.spells['spell.marshal.carapace'].column=5;
  expect(()=>new ContentRegistry(s)).toThrow();
});
