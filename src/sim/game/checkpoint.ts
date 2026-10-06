import {CHECKSUM_EVERY} from '../../shared/match/match';
import type {Stock} from '../../content/schema';
import type {Entity,GameState} from './state';

/** A cheap divergence signal, not a proof of complete state equality. Full
 * audits are explicit diagnostics, never an automatic periodic fallback. */
export type ChecksumMode = 'signal' | 'full';
export const CHECKPOINT_ACTORS = 32;
export const checkpointPhase = (tick:number) => Math.floor(tick / CHECKSUM_EVERY);

function textHash(text:string):number {
  let h=2166136261;
  for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);
  return h;
}
class Fingerprint {
  value=2166136261;
  integer(value:number|null|undefined) {
    // Selected fields are schema-validated integers. Include the high word so
    // large counters cannot silently alias after 2^32; null has its own marker.
    this.value=Math.imul(this.value^(value??-1),16777619);
    this.value=Math.imul(this.value^(value==null?-1:Math.floor(value/4294967296)),16777619);
  }
  text(value:string|null|undefined){this.integer(value==null?null:textHash(value));}
  stock(stock:Stock) {
    // Key insertion order can differ after restore. Combine item/value pairs
    // without sorting, copying or building a serialized representation.
    let sum=0,count=0;
    for(const key in stock){
      const amount=stock[key]!;
      sum=(sum+Math.imul(textHash(key)^amount,16777619)+Math.floor(amount/4294967296))|0;count++;
    }
    this.integer(count);this.integer(sum);
  }
}

/** Reuses maintained counters and the existing body index. No forest/fog walk,
 * AI snapshots, full routes, recursive object hashing or new per-tick work.
 * Up to 32 actors are sampled across the index; a stable index is covered in
 * ceil(actorCount/32) checkpoints. Selection never depends on prior hash calls. */
export function gameplayCheckpoint(s:GameState,actors:readonly Entity[]):number {
  const h=new Fingerprint();
  h.integer(s.tick);h.integer(s.random);h.integer(s.entities.length);h.integer(actors.length);
  h.integer(s.nextId);h.integer(s.nextJob);h.integer(s.nextQueue);h.integer(s.nextFact);
  h.integer(s.nextCast);h.integer(s.nextMissile);h.integer(s.nextShell);h.integer(s.nextSpellVision);
  // Jobs are a small active-work set, not a traversal of terrain or resource entities.
  for (const job of s.jobs) if (job.type === 'harvest') {
    h.integer(job.id); h.integer(job.worker); h.integer(job.source); h.integer(job.target);
    h.text(job.phase); h.integer(job.arrivedTick); h.integer(job.progress); h.integer(job.amount);
  }
  h.integer(s.jobs.length);h.integer(s.corpses.length);h.integer(s.missiles.length);h.integer(s.shells.length);
  h.integer(s.spellInstances.length);h.integer(s.spellDeliveries.length);h.integer(s.spellVisions.length);
  h.integer(s.spellLifecycleReactions.length);h.integer(s.spellCombatEvents.length);h.integer(s.clearedCamps.length);
  h.stock(s.accounting.produced);h.stock(s.accounting.consumed);h.stock(s.accounting.lost);
  for(const owner of Object.keys(s.wallets).sort()){h.text(owner);h.stock(s.wallets[owner]);}
  h.stock(s.objectives);h.text(s.outcome?.winner);h.integer(s.outcome?.defeated.length);
  for(const owner of s.outcome?.defeated??[])h.text(owner);
  const stride=Math.max(1,Math.ceil(actors.length/CHECKPOINT_ACTORS));
  for(let i=checkpointPhase(s.tick)%stride;i<actors.length;i+=stride){
    const e=actors[i]!,u=e.unit,p=e.production,a=e.abilities,order=u?.order;
    h.integer(e.id);h.text(e.definition);h.text(e.owner);h.text(e.surface);
    h.integer(e.x*1000);h.integer(e.y*1000);h.integer(u?.position?.x);h.integer(u?.position?.y);
    h.integer(e.hp);h.stock(e.inventory);h.integer(e.construction?.progress);
    h.integer(e.resource?.amount);h.integer(e.progression?.experience);
    h.integer(u?.target);h.integer(u?.goal);h.integer(u?.cooldown);h.integer(u?.contained);
    h.integer(u?.cargo?.amount);h.text(u?.cargo?.item);h.integer(u?.orderQueue.length);
    h.text(order?.type);
    h.integer(order&&'target' in order?order.target:null);
    h.integer(order&&'destination' in order?order.destination.x:null);
    h.integer(order&&'destination' in order?order.destination.y:null);
    h.integer(p?.queue.length);h.integer(p?.queue[0]?.id);h.text(p?.queue[0]?.definition);
    h.integer(p?.active?.progress);h.integer(p?.produced);
    h.integer(a?.mana);h.integer(a?.pending?.id);h.integer(a?.pending?.target);h.integer(a?.pending?.releaseTick);
    h.integer(e.revival?.queue.length);
    for(const q of e.revival?.queue??[]){h.integer(q.id);h.integer(q.hero);h.integer(q.level);h.integer(q.progress);}
    h.integer(e.spellStatuses?.length);h.integer(e.upgrade?.progress);
  }
  return h.value>>>0;
}
