import { z } from "zod";
import {
  actionsSchema,
  assetSchema,
  authoredDefinitionSchema,
  behaviorNames,
  behaviorSetSchema,
  definitionSchema,
  rulesSchema,
  type Definition,
  type Asset,
  type Rules,
} from "./schema";

export type ContentSource = {
  definitions: unknown[];
  behaviorSets: unknown[];
  assets: unknown[];
  actions: unknown;
  rules: unknown;
};
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function fingerprint(value: unknown): string {
  let h = 2166136261;
  for (const c of canonical(value))
    h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0).toString(16).padStart(8, "0");
}
function freeze<T>(v: T): T {
  if (v && typeof v === "object") {
    for (const x of Object.values(v)) freeze(x);
    Object.freeze(v);
  }
  return v;
}
const ordinal = (a: { id: string }, b: { id: string }) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** No IO, browser, or simulation dependencies. The entire reference graph commits together. */
export class ContentRegistry {
  readonly definitions: readonly Definition[];
  readonly assets: readonly Asset[];
  readonly rules: Rules;
  readonly actions: z.infer<typeof actionsSchema>;
  readonly fingerprint: string;
  private readonly byId: Readonly<Record<string, Definition>>;
  private readonly byAsset: Readonly<Record<string, Asset>>;
  constructor(source: ContentSource) {
    z.object({
      definitions: z.array(z.unknown()),
      behaviorSets: z.array(z.unknown()),
      assets: z.array(z.unknown()),
      actions: z.unknown(),
      rules: z.unknown(),
    })
      .strict()
      .parse(source);
    const unique = <T extends { id: string }>(xs: T[], label: string) => {
      const ids = new Set<string>();
      for (const x of xs) {
        if (ids.has(x.id)) throw new Error(`${label}: duplicate ${x.id}`);
        ids.add(x.id);
      }
      return xs;
    };
    const parse = <T>(
      schema: z.ZodType<T>,
      raw: unknown,
      category: string,
    ): T => {
      try {
        return schema.parse(raw);
      } catch (e) {
        const id = (raw as { id?: string })?.id ?? "?";
        throw new Error(
          `content/game.json · ${category}/${id}: ${(e as Error).message}`,
        );
      }
    };
    const sets = unique(
      source.behaviorSets.map((x) =>
        parse(behaviorSetSchema, x, "behaviorSets"),
      ),
      "behavior sets",
    );
    const raw = unique(
      source.definitions.map((x) =>
        parse(authoredDefinitionSchema, x, "definitions"),
      ),
      "definitions",
    );
    this.assets = freeze(
      unique(
        source.assets.map((x) => parse(assetSchema, x, "assets")),
        "assets",
      ).sort(ordinal),
    );
    this.byAsset = Object.fromEntries(this.assets.map((a) => [a.id, a]));
    this.rules = freeze(parse(rulesSchema, source.rules, "rules"));
    this.actions = freeze(parse(actionsSchema, source.actions, "actions"));
    this.definitions = freeze(
      raw
        .map((raw) => {
          const merged: Record<string, Record<string, unknown>> = {};
          const conflicts = new Set<string>();
          for (const setId of raw.behaviorSets ?? []) {
            const set = sets.find((s) => s.id === setId);
            if (!set)
              throw new Error(`${raw.id}.behaviorSets: unknown ${setId}`);
            for (const [name, values] of Object.entries(set.behaviors))
              for (const [field, value] of Object.entries(values)) {
                const dest = (merged[name] ??= {});
                if (
                  field in dest &&
                  canonical(dest[field]) !== canonical(value)
                )
                  conflicts.add(`${name}.${field}`);
                dest[field] = value;
              }
            for (const name of Object.keys(set.behaviors)) merged[name] ??= {};
          }
          for (const [name, values] of Object.entries(raw.behaviors ?? {})) {
            Object.assign((merged[name] ??= {}), values);
            for (const field of Object.keys(values))
              conflicts.delete(`${name}.${field}`);
          }
          for (const name of raw.disabledBehaviors ?? []) {
            delete merged[name];
            for (const c of conflicts)
              if (c.startsWith(name + ".")) conflicts.delete(c);
          }
          if (conflicts.size)
            throw new Error(
              `${raw.id}: conflicting behavior defaults: ${[...conflicts].join(", ")}`,
            );
          const {
            behaviorSets: _sets,
            disabledBehaviors: _disabled,
            ...fields
          } = raw;
          return definitionSchema.parse({ ...fields, behaviors: merged });
        })
        .sort(ordinal),
    );
    this.byId = Object.fromEntries(this.definitions.map((d) => [d.id, d]));
    this.validate();
    this.fingerprint = fingerprint({
      definitions: this.definitions,
      assets: this.assets,
      actions: this.actions,
      rules: this.rules,
    });
    freeze(this.byId);
    freeze(this.byAsset);
    Object.freeze(this);
  }
  get(id: string): Definition {
    const d = this.byId[id];
    if (!d) throw new Error(`Unknown definition: ${id}`);
    return d;
  }
  find(id: string): Definition | undefined {
    return this.byId[id];
  }
  asset(id: string): Asset {
    const a = this.byAsset[id];
    if (!a) throw new Error(`Unknown asset: ${id}`);
    return a;
  }
  withBehavior(name: (typeof behaviorNames)[number]): readonly Definition[] {
    return this.definitions.filter((d) => d.behaviors[name]);
  }
  private validate() {
    const expect = (id: string, kind: Definition["kind"]) => {
      const d = this.get(id);
      if (d.kind !== kind) throw new Error(`${id}: expected ${kind}`);
      return d;
    };
    for (const [id, r] of Object.entries(this.rules.research)) {
      if (!this.asset(r.icon).image) throw new Error(`${id}: research icon must be an image`);
      if (new Set(r.items.map(p => p.item)).size !== r.items.length) throw new Error(`${id}: duplicate research input`);
      for (const p of r.items) expect(p.item, "item");
      for (const prerequisite of r.requires ?? []) expect(prerequisite, "building");
      for (const effect of r.effects) {
        if (new Set(effect.units).size !== effect.units.length) throw new Error(`${id}: duplicate research unit`);
        for (const unit of effect.units) {
          const target = expect(unit, "unit");
          if ((effect.splashRadius !== undefined || effect.splashSlowPermille !== undefined) && !target.behaviors.combat?.shell) throw new Error(`${id}: splash research requires shell combat`);
          if (effect.chargeCooldownPermille && !target.behaviors.combat?.charge) throw new Error(`${id}: charge research requires charge combat`);
          if (effect.treeHitDamage && !target.behaviors.work) throw new Error(`${id}: tree research requires worker`);
        }
      }
    }
    for (const asset of this.assets) {
      if (asset.character && (!asset.file || asset.carryAsset))
        throw new Error(
          `${asset.id}: animated characters require a file and use carry animation instead of carryAsset`,
        );
      if (asset.carryAsset && !this.asset(asset.carryAsset).file)
        throw new Error(`${asset.id}: carryAsset must be a model`);
      if (!asset.file && !asset.image)
        throw new Error(`${asset.id}: missing file/image`);
    }
    const types = Object.keys(this.rules.damageTypes).sort();
    if (!types.length || types.join() !== Object.keys(this.rules.damageMultipliers).sort().join())
      throw new Error("Every damage type needs exactly one matchup row");
    for (const row of Object.values(this.rules.damageMultipliers))
      if (Object.keys(row).sort().join() !== Object.keys(this.rules.armorTypes).sort().join())
        throw new Error("Every damage row must exactly cover the armor classes");
    for (const armor of Object.values(this.rules.armorTypes)) {
      if (!this.asset(armor.icon).image)
        throw new Error("Armor icon must reference an image");
    }
    for (const [id, pool] of Object.entries(this.rules.lootPools)) {
      for (const entry of pool.entries) {
        if (entry.item && (this.get(entry.item).itemTier ?? 1) > (pool.maxTier ?? 2))
          throw new Error(`${id}: item exceeds declared loot tier`);
        if (entry.item !== null && !expect(entry.item, "item").itemEffect)
          throw new Error(`${id}: loot must be a hero item, not a currency`);
      }
      if (new Set(pool.entries.map((e) => e.item)).size !== pool.entries.length)
        throw new Error(`${id}: duplicate loot entry`);
    }
    for (const d of this.definitions) {
      const fail = (text: string): never => {
        throw new Error(`${d.id}: ${text}`);
      };
      if (d.requires) {
        if (new Set(d.requires).size !== d.requires.length) fail("duplicate prerequisite");
        for (const id of d.requires) {
          if (id === d.id || this.get(id).kind !== "building")
            fail("prerequisites must reference another building");
        }
      }
      if (d.behaviors.research) {
        if (d.kind !== "building") fail("research requires building");
        const outputs = d.behaviors.research.outputs;
        if (new Set(outputs).size !== outputs.length) fail("duplicate research output");
        for (const id of outputs) if (!this.rules.research[id]) fail(`unknown research ${id}`);
      }
      if (d.upgrade) {
        const target = this.get(d.upgrade.target);
        if (d.kind !== "building" || target.kind !== "building" || target.id === d.id ||
            canonical(d.footprint) !== canonical(target.footprint) ||
            canonical(d.entrance) !== canonical(target.entrance) ||
            canonical(d.behaviors) !== canonical(target.behaviors) ||
            target.body!.maxHp < d.body!.maxHp)
          fail("upgrade requires a different building with compatible footprint, behaviors and health capacity");
        if (new Set(d.upgrade.items.map(p => p.item)).size !== d.upgrade.items.length)
          fail("duplicate upgrade input");
        for (const input of d.upgrade.items) expect(input.item, "item");
      }
      if (d.itemTier && (!d.itemEffect || d.kind !== "item")) fail("item tier requires a hero item");
      if (d.itemEffect) {
        const effect=d.itemEffect;
        for(const hit of [effect.active, effect.onHit])
          if(hit && "damageType" in hit && hit.damageType && !this.rules.damageTypes[hit.damageType]) fail("unknown item damage type");
        if(effect.active?.damage && !effect.active.damageType) fail("item damage requires damageType");
        if(effect.active?.target === "self" && effect.active.radius !== 0) fail("self item radius must be zero");
        if(effect.active && effect.active.target !== "self" && !effect.active.radius) fail("area item requires radius");
      }
      if (!d.id.startsWith(d.kind + ".")) fail("ID prefix must match kind");
      if (!this.asset(d.asset).file) fail("asset must reference a model");
      if (!this.asset(d.icon).image) fail("icon must reference an image");
      if (d.kind !== "resource" && this.asset(d.asset).sceneryAsset)
        fail("batched scenery models require a resource definition");
      if ((d.kind === "unit" || d.kind === "building") && !d.body)
        fail("body required");
      if (
        d.body &&
        Object.values(this.rules.damageMultipliers).some(
          (row) => row[d.body!.armorType] === undefined,
        )
      )
        fail("armor type must be covered by each damage row");
      if (d.body && !this.rules.armorTypes[d.body.armorType])
        fail("armor type needs presentation metadata");
      if (
        d.kind === "building" &&
        d.footprint &&
        (!(d.footprint.width % 2) || !(d.footprint.depth % 2))
      )
        fail("footprint dimensions must be odd cell counts");
      if (d.behaviors.combat?.projectile && d.behaviors.combat.shell) fail("weapon cannot launch both a missile and an area shell");
      if (d.behaviors.combat && d.kind !== "unit")
        fail("combat currently requires a unit");
      if (d.kind === "resource" && !this.asset(d.asset).sceneryAsset)
        fail("resource model needs sceneryAsset");
      if (d.felling && (d.kind !== "resource" || !d.yield || !this.asset(d.asset).harvestAnimation))
        fail("felling requires a resource yield and animated scenery asset");
      if (d.kind !== "unit" && d.hero) fail("hero flag requires a unit");
      if (d.behaviors.spellcasting) {
        this.asset(d.behaviors.spellcasting.manaIcon);
        if (!this.actions.categories[d.behaviors.spellcasting.learningCategory])
          fail("unknown learning category");
        if (!d.hero || !d.behaviors.progression)
          fail("spellcasting requires a progressing hero");
        if (
          new Set(d.behaviors.spellcasting.abilities).size !==
          d.behaviors.spellcasting.abilities.length
        )
          fail("duplicate abilities");
        for (const id of d.behaviors.spellcasting.abilities)
          if (!this.rules.spells[id]) fail(`unknown ability ${id}`);
      }
      if (d.behaviors.inventory && (!d.hero || !d.behaviors.movement))
        fail("inventory requires a mobile hero");
      if (d.itemEffect && (d.kind !== "item" || d.stackLimit !== 1))
        fail("hero items require item kind and stackLimit 1");
      if (d.behaviors.progression) {
        const levels = d.behaviors.progression.levels.map(l => l.experience);
        if (
          !d.hero ||
          levels[0] !== 0 ||
          levels.some((n, i) => i > 0 && n <= levels[i - 1])
        )
          fail(
            "progression requires a hero and strictly increasing XP thresholds starting at zero",
          );
        const first = d.behaviors.progression.levels[0];
        if (first.maxHp !== d.body?.maxHp || first.armor !== d.body?.armor ||
            first.damage !== (d.behaviors.combat?.damage ?? 0) ||
            first.cooldownTicks !== (d.behaviors.combat?.cooldownTicks ?? 1) ||
            first.maxMana !== (d.behaviors.spellcasting?.maxMana ?? 0) ||
            first.manaRegenPerSecond !== (d.behaviors.spellcasting?.manaRegenPerSecond ?? 0))
          fail("level-one stats must match body, combat and spellcasting declarations");
        if (d.behaviors.progression.levels.some((l,i,ls) =>
          (i > 0 && (l.maxHp < ls[i-1].maxHp || l.maxMana < ls[i-1].maxMana)) ||
          (!d.behaviors.spellcasting && (l.maxMana > 0 || l.manaRegenPerSecond > 0))))
          fail("progression pools must not shrink; mana requires spellcasting");
        if (d.level !== undefined && d.level !== 1)
          fail("progression starts at level 1");
      }
      if (d.kind === "building" && (!d.footprint || !d.entrance))
        fail("footprint/entrance required");
      if (
        d.footprint &&
        d.entrance &&
        Math.abs(d.entrance.x) <= d.footprint.width / 2 &&
        Math.abs(d.entrance.y) <= d.footprint.depth / 2
      )
        fail("entrance must be outside footprint");
      if (d.kind === "item" && !d.stackLimit) fail("stackLimit required");
      if (d.kind === "resource" && !d.yield) fail("yield required");
      if (d.yield && !["resource", "building"].includes(d.kind))
        fail("yield requires a resource or mine building");
      if (d.gatheringCapacity && (!d.yield || d.kind !== "building"))
        fail("gathering capacity requires a mine building");
      if (d.currency && (d.kind !== "item" || d.itemEffect))
        fail("currency must be a non-equipment item");
      if (d.behaviors.work && (!d.behaviors.movement || d.kind !== "unit"))
        fail("work requires mobile unit");
      if (
        d.behaviors.campDefense &&
        (!d.behaviors.movement || !d.behaviors.combat)
      )
        fail("camp defense requires movement and combat");
      if (
        d.behaviors.combat &&
        !this.rules.damageMultipliers[d.behaviors.combat.damageType]
      )
        fail("unknown damage type");
      for (const id of d.behaviors.work?.builds ?? [])
        if (expect(id, "building").creation?.method !== "construct")
          fail(`unconstructable ${id}`);
      for (const id of d.behaviors.storage?.accepts ?? []) expect(id, "item");
      for (const id of d.behaviors.work?.harvests ?? []) {
        if (expect(id, "item").creation?.method !== "harvest")
          fail(`worker harvest ${id} requires a harvest recipe`);
        const recipe = this.get(id).creation!;
        if (recipe.method === "harvest" && this.get(recipe.source).felling &&
            d.behaviors.work!.carryCapacity < this.get(recipe.source).yield!)
          fail("worker must be able to carry a complete felled resource");
      }
      if (d.constructionClearance !== undefined && !d.yield)
        fail("construction clearance requires resource yield");
      if (d.placementNear && (d.kind !== "building" || d.creation?.method !== "construct" || !this.get(d.placementNear.source).yield))
        fail("placement-near requires a constructable building and a finite resource source");
      if (d.behaviors.storage?.dropoff && d.kind !== "building")
        fail("drop-off requires building");
      const c = d.creation;
      if (c) {
        if (new Set(c.items.map((p) => p.item)).size !== c.items.length)
          fail("duplicate creation input");
        for (const input of c.items) expect(input.item, "item");
        if (c.method === "construct" && d.kind !== "building")
          fail("construct target must be building");
        if (c.method === "recruit") {
          if (d.kind !== "unit" || !expect(c.unitInput, "unit").behaviors.work)
            fail("recruit requires unit and worker input");
        }
        if (c.method === "harvest" && d.kind !== "item")
          fail("harvest targets items");
        if (c.method === "harvest" && !this.get(c.source).yield)
          fail("harvest source requires yield");
        if (c.method === "harvest") {
          const source = this.get(c.source);
          if (!!source.felling !== (c.impactTick !== undefined) ||
              (c.impactTick !== undefined && c.impactTick >= c.workTicks))
            fail("felling harvest requires an impact tick inside the work cycle");
          if (source.felling && c.amount !== source.yield)
            fail("a felled resource must yield one complete load");
        }
        if (c.method === "plant" && (d.kind !== "resource" || !d.regrowthTicks))
          fail("plant needs resource and regrowthTicks");
        if (c.method === "spawn" && d.kind !== "unit")
          fail("spawn target must be unit");
      }
      const p = d.behaviors.production;
      if (!p) continue;
      if (d.kind !== "building") fail("production requires building");
      if (p.mode === "automatic" && p.outputs.length !== 1)
        fail("automatic production has one output");
      if (p.mode === "queued" && !p.queueCapacity)
        fail("queued production needs queueCapacity");
      if (new Set(p.outputs).size !== p.outputs.length)
        fail("duplicate outputs");
      for (const id of p.outputs) {
        const target = this.get(id),
          c = target.creation;
        if (!c || c.method === "construct") fail(`unsupported output ${id}`);
        if (!c) continue;
        if ((c.method === "recruit") !== (p.mode === "queued"))
          fail(`${c.method} has incompatible production mode`);
        const needsWorker = ["harvest", "plant"].includes(c.method);
        if (p.workerSlots !== (needsWorker ? 1 : 0))
          fail(`${c.method} has invalid staffing`);
        if (["harvest", "plant"].includes(c.method) && !p.workRadius)
          fail("external work requires workRadius");
        if ((c.method === "spawn") !== !!p.population)
          fail("spawn requires population capacity and interval, exclusively");
        if (p.population && !target.behaviors.work)
          fail("population output must be a worker");
        const store = d.behaviors.storage;
        for (const input of c.items)
          if (!store?.accepts.includes(input.item))
            fail(`storage must accept ${input.item} for ${id}`);
        const required = Math.max(
          c.items.reduce((n, v) => n + v.amount, 0),
          target.kind === "item" ? 1 : 0,
        );
        if (required > (store?.capacity ?? 0))
          fail(`insufficient storage for ${id}`);
      }
    }
    const keys = new Set<string>();
    const categoryExists = (id: string | null | undefined) => {
      if (id && !this.actions.categories[id])
        throw new Error(`Unknown command category ${id}`);
    };
    for (const [id, category] of Object.entries(this.actions.categories)) {
      categoryExists(category.parent);
      const visited = new Set([id]);
      let parent = category.parent;
      while (parent) {
        if (visited.has(parent))
          throw new Error(`Command category cycle at ${id}`);
        visited.add(parent);
        parent = this.actions.categories[parent]?.parent;
      }
    }
    for (const d of this.definitions) categoryExists(d.category);
    for (const a of [
      ...Object.values(this.actions.actions),
      ...Object.values(this.actions.categories),
      ...Object.values(this.actions.navigation),
    ]) {
      if ("category" in a && typeof a.category === "string")
        categoryExists(a.category);
      this.asset(a.icon);
      if (!this.asset(a.icon).image)
        throw new Error(`Command icon must reference an image: ${a.icon}`);
      if (a.hotkey) {
        if (keys.has(a.hotkey)) throw new Error(`Duplicate hotkey ${a.hotkey}`);
        keys.add(a.hotkey);
      }
    }
    for (const [binding, a] of Object.entries(this.actions.overrides)) {
      categoryExists(a.category);
      const [name, ...target] = binding.split(":");
      if (!["build", "produce"].includes(name) || !this.find(target.join(":")))
        throw new Error(`Invalid action binding ${binding}`);
      if (a.hotkey) {
        if (keys.has(a.hotkey)) throw new Error(`Duplicate hotkey ${a.hotkey}`);
        keys.add(a.hotkey);
      }
    }
    for (const [id, spell] of Object.entries(this.rules.spells)) {
      this.asset(spell.icon);
      if (spell.damageTargetBudget &&
          (!["line", "blast"].includes(spell.effect) || spell.ranks.some(r => !r.damage)))
        throw new Error(`${id}: damage budget requires an offensive area spell`);
      if (!this.rules.spellVisuals[spell.visual])
        throw new Error(`${id}: unknown spell visual`);
      if (!this.rules.damageMultipliers[spell.damageType])
        throw new Error(`${id}: unknown spell damage type`);
      if (
        spell.ranks.some(
          (r, i) =>
            i > 0 && r.requiredLevel <= spell.ranks[i - 1].requiredLevel,
        )
      )
        throw new Error(`${id}: rank levels must increase`);
      if (
        (spell.effect === "line" || spell.effect === "blast") !==
        (spell.target === "point")
      )
        throw new Error(`${id}: effect target mismatch`);
    }
    const setup = this.rules.startingSetup;
    const fort = expect(setup.fort, "building");
    for (const [id, n] of Object.entries(setup.inventory)) {
      expect(id, "item");
      if (n && !fort.behaviors.storage?.accepts.includes(id))
        throw new Error(`Starting store cannot accept ${id}`);
    }
    if (
      Object.values(setup.inventory).reduce((a, b) => a + b, 0) >
      (fort.behaviors.storage?.capacity ?? 0)
    )
      throw new Error("Starting inventory exceeds fort capacity");
    for (const u of setup.units) expect(u.definition, "unit");
    for (const task of setup.gathering ?? [])
      if (expect(task.item, "item").creation?.method !== "harvest")
        throw new Error("Starting gather requires harvest recipe");
    const ai = this.rules.ai;
    if (
      ai.workers.minimum > ai.workers.target ||
      ai.workers.target > ai.workers.maximum ||
      ai.workers.reserve >= ai.workers.minimum ||
      ai.army.minimum > ai.army.maximum
    )
      throw new Error("rules.ai: inconsistent workforce/army limits");
    if (
      new Set(ai.composition.map((x) => x.definition)).size !==
        ai.composition.length ||
      new Set(ai.skillPreference).size !== ai.skillPreference.length
    )
      throw new Error("rules.ai: duplicate preference");
    for (const entry of ai.composition) {
      const d = expect(entry.definition, "unit");
      if (
        !d.behaviors.combat ||
        d.creation?.method !== "recruit" ||
        !this.definitions.some(
          (b) =>
            b.behaviors.production?.outputs.includes(d.id) &&
            this.definitions.some((w) =>
              w.behaviors.work?.builds.includes(b.id),
            ),
        )
      )
        throw new Error(
          `rules.ai.composition: no buildable recruiter for ${d.id}`,
        );
    }
    for (const id of ai.skillPreference)
      if (
        !this.rules.spells[id] ||
        !this.definitions.some((d) =>
          d.behaviors.spellcasting?.abilities.includes(id),
        )
      )
        throw new Error(`rules.ai.skillPreference: unlearnable ${id}`);
  }
}
