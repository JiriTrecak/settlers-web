import { alive, type Entity } from './state';
type Membership={cell:number|undefined;reservation:number|undefined};

/** Derived broad phase. Refresh at each planning/movement boundary; never saved.
 * Bucket iteration is spatial membership, not a gameplay priority order. */
export class UnitIndex {
  private readonly buckets = new Map<number, Set<Entity>>();
  // Resolve both memberships once per body update; unchanged bodies need no
  // hash-table writes. Refresh still rechecks live collision eligibility.
  private readonly membership = new Map<number, Membership>();
  private readonly reserved = new Map<number, Set<Entity>>();
  readonly entities: Map<number, Entity>;

  constructor(
    entities: readonly Entity[],
    private readonly size: number,
    private readonly ignores: (entity: Entity) => boolean,
  ) {
    this.entities = new Map();
    this.refresh(entities);
  }

  /** Revalidate every body's live state, retaining only unchanged bucket storage.
   * Entity identity matters: restore can replace all records while reusing IDs. */
  refresh(entities:readonly Entity[]):void {
    const present=new Set(entities);
    for(const old of this.entities.values())if(!present.has(old)){
      const {cell,reservation}=this.membership.get(old.id)!;
      if(cell!==undefined){const bucket=this.buckets.get(cell)!;bucket.delete(old);if(!bucket.size)this.buckets.delete(cell);}
      if(reservation!==undefined){const bucket=this.reserved.get(reservation)!;bucket.delete(old);if(!bucket.size)this.reserved.delete(reservation);}
      this.membership.delete(old.id);
      this.entities.delete(old.id);
    }
    for(const entity of entities)this.update(entity);
  }

  update(entity: Entity) {
    let member=this.membership.get(entity.id);
    if(!member){
      member={cell:undefined,reservation:undefined};
      this.membership.set(entity.id,member);this.entities.set(entity.id,entity);
    }
    const old = member.cell;
    const cell = entity.y * this.size + entity.x;
    const active = entity.unit && alive(entity) &&
      !entity.unit.contained && !entity.unit.release && !this.ignores(entity);

    const priorReservation=member.reservation;
    const reservation=active&&entity.unit!.detour?.yielding?entity.unit!.detour.waypoint:undefined;
    if(priorReservation!==reservation){
      if(priorReservation!==undefined){const bucket=this.reserved.get(priorReservation)!;bucket.delete(entity);if(!bucket.size)this.reserved.delete(priorReservation);}
      if(reservation!==undefined){const bucket=this.reserved.get(reservation)??new Set<Entity>();bucket.add(entity);this.reserved.set(reservation,bucket);}
      member.reservation=reservation;
    }
    if (old !== undefined && (!active || old !== cell)) {
      const bucket = this.buckets.get(old)!;
      bucket.delete(entity);
      if (!bucket.size) this.buckets.delete(old);
      member.cell=undefined;
    }
    if (!active || member.cell!==undefined) return;

    let bucket = this.buckets.get(cell);
    if (!bucket) {
      bucket = new Set();
      this.buckets.set(cell, bucket);
    }
    bucket.add(entity);
    member.cell=cell;
  }

  inCell(x: number, y: number): Iterable<Entity> {
    return this.buckets.get(y * this.size + x) ?? [];
  }

  reservedInCell(x:number,y:number):Iterable<Entity>{return this.reserved.get(y*this.size+x)??[];}

  *within(minX: number, minY: number, maxX: number, maxY: number): Iterable<Entity> {
    // Coordinates are fixed-point, while cells are rounded about their centers.
    const x0 = Math.max(0, Math.floor((minX + 500) / 1000));
    const x1 = Math.min(this.size - 1, Math.floor((maxX + 500) / 1000));
    const y0 = Math.max(0, Math.floor((minY + 500) / 1000));
    const y1 = Math.min(this.size - 1, Math.floor((maxY + 500) / 1000));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        // Empty cells need no array or delegated iterator.
        const bucket=this.buckets.get(y*this.size+x);
        if(bucket)yield* bucket;
      }
    }
  }
}
