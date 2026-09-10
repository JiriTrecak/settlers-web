import { areaDamageScale, stunDuration } from "../game/damage";
import { spellAreaContains } from "../../content/spellArea";
import type { EntityView } from "../game/observation";
import type { AIState } from "./state";
import type { Emit } from "./economy";
import { Frame, ordinal, distance, integerPoint } from "./frame";

function itemValue(f: Frame, id: string | null) {
  const effect = id ? f.registry.get(id).itemEffect : null;
  return !effect
    ? 0
    : effect.type === "equipment"
      ? effect.damage * 8 + effect.armor * 20 + effect.maxHp
      : effect.heal * 0.5;
}
export function heroActions(f: Frame, s: AIState, emit: Emit) {
  const preference = (id: string) => {
    const i = f.registry.rules.ai.skillPreference.indexOf(id);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  for (const hero of f.army.filter((e) => f.def(e).hero)) {
    const d = f.def(hero),
      casting = hero.spellcasting,
      level = hero.stats?.level ?? 1;
    if (casting) {
      const spent = Object.values(casting.learned).reduce((a, b) => a + b, 0);
      if (spent < level) {
        const abilities = d.behaviors
          .spellcasting!.abilities.map((id) => ({
            id,
            spell: f.registry.rules.spells[id]!,
            learned: casting.learned[id] ?? 0,
          }))
          .filter((a) => a.spell.ranks[a.learned]?.requiredLevel <= level)
          .sort((a, b) => {
            const ultimate = (a: (typeof abilities)[number]) =>
              a.spell.ranks.length === 1 && a.spell.ranks[0]!.requiredLevel > 1
                ? 1
                : 0;
            return (
              ultimate(b) - ultimate(a) ||
              a.learned - b.learned ||
              preference(a.id) - preference(b.id) ||
              ordinal(a.id, b.id)
            );
          });
        if (
          abilities[0] &&
          emit(
            { type: "learnAbility", actor: hero.id, ability: abilities[0].id },
            "Spend the hero skill point on an eligible rank",
          )
        )
          continue;
      }
    }
    const missing = (hero.stats?.maxHp ?? d.body!.maxHp) - (hero.hp ?? 0);
    const healing =
      hero.equipment?.findIndex((id) => {
        const effect = id ? f.registry.get(id).itemEffect : null;
        return (
          effect?.type === "consumable" &&
          missing >=
            Math.min(effect.heal * 0.65, (hero.stats?.maxHp ?? 0) * 0.35)
        );
      }) ?? -1;
    if (
      healing >= 0 &&
      (s.damage[hero.id]?.reactAt ?? 0) <= f.tick &&
      emit(
        { type: "useItem", actor: hero.id, slot: healing },
        "Use healing before risking the veteran",
      )
    )
      continue;
    if (hero.unit?.casting || hero.control?.stunned) continue;
    const visibleEnemies = f.hostiles.filter(
      (e) => e.unit && distance(hero, e) < 18,
    );
    const enemies = visibleEnemies.filter(
      (e) =>
        f.tick - (s.inspected[`contact:${e.id}`] ?? f.tick) >=
        f.registry.rules.ai.reactionTicks,
    );
    if (enemies.length && casting) {
      const candidates: {
        id: string;
        point?: { x: number; y: number };
        score: number;
      }[] = [];
      for (const id of d.behaviors.spellcasting?.abilities ?? []) {
        const spell = f.registry.rules.spells[id]!,
          rankIndex = (casting.learned[id] ?? 0) - 1,
          rank = spell.ranks[rankIndex];
        if (
          !rank ||
          casting.mana < rank.mana ||
          (casting.cooldowns[id] ?? 0) > f.tick
        )
          continue;
        if (spell.effect === "guard") {
          if (
            (hero.hp ?? 0) / (hero.stats?.maxHp ?? 1) < 0.65 &&
            enemies.some(
              (e) =>
                f.def(e).behaviors.combat &&
                distance(e, hero) < f.def(e).behaviors.combat!.range + 3,
            ) &&
            !hero.effects?.some((e) => e.ability === id)
          )
            candidates.push({ id, score: 60 });
        } else if (spell.effect === "rally") {
          const allies = f.army.filter(
            (e) =>
              distance(e, hero) <= rank.radius &&
              !e.effects?.some((b) => b.ability === id),
          );
          if (allies.length >= 3 && enemies.some((e) => distance(e, hero) < 10))
            candidates.push({
              id,
              score: allies.reduce((sum, a) => sum + (a.stats?.damage ?? 0) * rank.damageBonusPermille / 1000, 0) * 3,
            });
        } else {
          for (const target of enemies.slice(
            0,
            f.registry.rules.ai.limits.spellCandidates,
          )) {
            const p = integerPoint(target);
            if (
              distance(p, hero) > rank.range ||
              !f.view.fog?.cells[f.geo.index(p)]
            )
              continue;
            const effect = spell.effect;
            const hits = enemies.filter(enemy => spellAreaContains(effect, hero, p, rank.radius, enemy));
            const eligible = hits.filter(e => f.registry.rules.damageMultipliers[spell.damageType][f.def(e).body!.armorType] > 0);
            const scale = areaDamageScale(spell.damageTargetBudget, eligible.length);
            let score = 0;
            for (const enemy of hits) {
              score += Math.min(enemy.hp ?? 0, f.damage(enemy, rank.damage * scale, spell.damageType));
              score += stunDuration(f.registry.rules, rank.stunTicks, !!enemy.unit, !!f.def(enemy).hero) * 0.75;
            }
            // Expensive ultimates require a cluster or a durable priority target.
            if (score >= Math.max(35, rank.damage * 0.7))
              candidates.push({ id, point: p, score });
          }
        }
      }
      candidates.sort((a, b) => b.score - a.score || ordinal(a.id, b.id));
      const best = candidates[0];
      if (
        best &&
        emit(
          {
            type: "cast",
            actor: hero.id,
            ability: best.id,
            ...(best.point ? { point: best.point } : {}),
          },
          "Cast where the visible combat value justifies the cost",
        )
      )
        continue;
    }
    if (visibleEnemies.length || hero.control?.order?.type === "pickup")
      continue;
    const items = f.view.entities
      .filter(
        (e) =>
          e.item &&
          !e.remembered &&
          distance(e, hero) <= 12 &&
          (s.inspected[`item:${e.id}`] ?? 0) <= f.tick,
      )
      .sort(
        (a, b) =>
          itemValue(f, b.definition) - itemValue(f, a.definition) ||
          distance(a, hero) - distance(b, hero) ||
          a.id - b.id,
      );
    const target = items[0];
    if (!target || !hero.equipment) continue;
    const empty = hero.equipment.indexOf(null);
    if (empty >= 0)
      emit(
        { type: "pickup", actor: hero.id, target: target.id },
        "Collect the nearby camp reward",
      );
    else {
      const weakest = hero.equipment
        .map((id, slot) => ({ slot, value: itemValue(f, id) }))
        .sort((a, b) => a.value - b.value || a.slot - b.slot)[0]!;
      if (
        itemValue(f, target.definition) > weakest.value + 10 &&
        emit(
          { type: "dropItem", actor: hero.id, slot: weakest.slot },
          "Make room for a stronger item",
        )
      ) {
        // The dropped item appears on the next observation; suppress weaker pickups briefly.
        s.inspected[`replacement:${hero.id}`] = f.tick + 400;
      } else s.inspected[`item:${target.id}`] = f.tick + 1200;
    }
  }
}
export function reactions(f: Frame, s: AIState, emit: Emit) {
  const rules = f.registry.rules.ai;
  for (const worker of f.workers) {
    const danger = f.hostiles.filter(
      (e) =>
        f.def(e).behaviors.combat &&
        distance(e, worker) < f.def(e).behaviors.combat!.range + 5,
    );
    const memory = s.damage[worker.id];
    if (
      danger.length &&
      memory &&
      f.tick >= memory.reactAt &&
      memory.hp < (worker.stats?.maxHp ?? 1)
    ) {
      const order = worker.control?.order;
      if (order?.type === "gather")
        s.workerReturns[worker.id] = {
          target: order.target,
          until: f.tick + 240,
        };
      const threat = danger[0]!,
        v = {
          x: f.home.x + (f.home.x - threat.x) * 0.4,
          y: f.home.y + (f.home.y - threat.y) * 0.4,
        };
      emit(
        { type: "move", actors: [worker.id], destination: f.nearestSafe(v) },
        "Pull the threatened worker back through the base",
      );
    } else {
      const back = s.workerReturns[worker.id];
      if (
        back &&
        f.tick >= back.until &&
        !danger.length &&
        f.byId.get(back.target)?.resource?.amount
      ) {
        if (
          emit(
            { type: "gather", actors: [worker.id], target: back.target },
            "Return the evacuated worker to harvesting",
          )
        )
          delete s.workerReturns[worker.id];
      }
    }
  }
  for (const soldier of f.army) {
    if (
      soldier.id === s.scout ||
      soldier.control?.stunned ||
      soldier.unit?.casting
    )
      continue;
    const combat = f.def(soldier).behaviors.combat!,
      local = f.hostiles.filter(
        (e) => f.def(e).behaviors.combat && distance(e, soldier) < 14,
      );
    const health = (soldier.hp ?? 0) / (soldier.stats?.maxHp ?? 1),
      memory = s.damage[soldier.id];
    if (
      local.length &&
      health * 1000 < rules.army.retreatHealthPermille &&
      memory &&
      f.tick >= memory.reactAt
    ) {
      emit(
        {
          type: "move",
          actors: [soldier.id],
          destination: f.nearestSafe(f.home),
        },
        "Preserve a badly wounded fighter",
      );
      continue;
    }
    if (!local.length) continue;
    // Fight near the assigned operation; never chase a bait unit across the map.
    const center = s.mission?.point ?? f.home;
    const targets = local
      .filter(
        (e) =>
          distance(e, center) <= rules.army.pursuitRadius ||
          distance(e, f.home) < 20,
      )
      .sort((a, b) => {
        const score = (e: EntityView) =>
          distance(soldier, e) * 2 +
          (e.hp ?? 0) / Math.max(1, f.damage(e, soldier.stats?.damage ?? combat.damage, combat.damageType)) -
          (f.def(e).hero ? 10 : 0) -
          (f.def(e).behaviors.combat?.range ?? 0);
        return score(a) - score(b) || a.id - b.id;
      });
    const target = targets[0];
    if (!target) continue;
    const seen = s.inspected[`contact:${target.id}`] ?? f.tick;
    if (f.tick < seen + rules.reactionTicks) continue;
    // Limited archer spacing, only after a shot and only when a melee threat is already close.
    if (
      combat.range > 3 &&
      soldier.unit!.cooldown > f.tick &&
      distance(target, soldier) < 3 &&
      f.def(target).behaviors.combat!.range < 3
    ) {
      const d = Math.max(1, distance(soldier, target)),
        p = {
          x: soldier.x + ((soldier.x - target.x) / d) * 3,
          y: soldier.y + ((soldier.y - target.y) / d) * 3,
        };
      if (distance(p, center) <= rules.army.pursuitRadius)
        emit(
          { type: "move", actors: [soldier.id], destination: f.nearestSafe(p) },
          "Create a little space for the ranged line",
        );
    } else if (
      soldier.control?.order?.type !== "attack" ||
      soldier.control.order.target !== target.id
    ) {
      emit(
        { type: "attack", actors: [soldier.id], target: target.id },
        "Engage a visible target inside the operation area",
      );
    }
  }
}
