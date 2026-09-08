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
    for (const asset of this.assets) {
      if (asset.carryAsset && !this.asset(asset.carryAsset).file)
        throw new Error(`${asset.id}: carryAsset must be a model`);
      if (!asset.file && asset.atlasIndex === undefined)
        throw new Error(`${asset.id}: missing file/atlasIndex`);
    }
    for (const d of this.definitions) {
      const fail = (text: string): never => {
        throw new Error(`${d.id}: ${text}`);
      };
      if (!d.id.startsWith(d.kind + ".")) fail("ID prefix must match kind");
      if (!this.asset(d.asset).file) fail("asset must reference a model");
      if (this.asset(d.icon).atlasIndex === undefined)
        fail("icon must reference an atlas entry");
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
      if (
        d.kind === "building" &&
        d.footprint &&
        (!(d.footprint.width % 2) || !(d.footprint.depth % 2))
      )
        fail("footprint dimensions must be odd cell counts");
      if (d.behaviors.combat && d.kind !== "unit")
        fail("combat currently requires a unit");
      if (d.kind === "resource" && !this.asset(d.asset).sceneryAsset)
        fail("resource model needs sceneryAsset");
      if (d.kind !== "unit" && d.hero) fail("hero flag requires a unit");
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
        if (
          (c.method === "craft" || c.method === "harvest") &&
          d.kind !== "item"
        )
          fail("craft/harvest targets items");
        if (c.method === "harvest") expect(c.source, "resource");
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
        if (
          (c.method === "recruit") !== (p.mode === "queued") &&
          c.method !== "craft"
        )
          fail(`${c.method} has incompatible production mode`);
        const needsWorker = ["harvest", "craft", "plant"].includes(c.method);
        if (p.workerSlots !== (needsWorker ? 1 : 0))
          fail(`${c.method} has invalid staffing`);
        if (["harvest", "plant"].includes(c.method) && !p.workRadius)
          fail("external work requires workRadius");
        if (c.method === "spawn" && !p.totalLimit)
          fail("spawn requires totalLimit");
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
    for (const a of Object.values(this.actions.actions)) {
      this.asset(a.icon);
      if (a.hotkey) {
        if (keys.has(a.hotkey)) throw new Error(`Duplicate hotkey ${a.hotkey}`);
        keys.add(a.hotkey);
      }
    }
    for (const [binding, a] of Object.entries(this.actions.overrides)) {
      const [name, ...target] = binding.split(":");
      if (!["build", "produce"].includes(name) || !this.find(target.join(":")))
        throw new Error(`Invalid action binding ${binding}`);
      if (a.hotkey) {
        if (keys.has(a.hotkey)) throw new Error(`Duplicate hotkey ${a.hotkey}`);
        keys.add(a.hotkey);
      }
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
    for (const id of this.rules.ai.buildOrder) expect(id, "building");
    expect(this.rules.ai.recruit, "unit");
  }
}
