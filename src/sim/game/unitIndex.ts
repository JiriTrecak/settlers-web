import { alive, type Entity } from './state';

/** Ephemeral broad phase for one movement pass; never part of saved state. */
export class UnitIndex {
  private readonly buckets = new Map<number, Set<Entity>>();
  private readonly cells = new Map<number, number>();
  private readonly reserved = new Map<number, Set<Entity>>();
  private readonly reservations = new Map<number, number>();
  readonly entities: Map<number, Entity>;

  constructor(
    entities: readonly Entity[],
    private readonly size: number,
    private readonly ignores: (entity: Entity) => boolean,
  ) {
    this.entities = new Map(entities.map(entity => [entity.id, entity]));
    for (const entity of entities) this.update(entity);
  }

  update(entity: Entity) {
    const old = this.cells.get(entity.id);
    const cell = entity.y * this.size + entity.x;
    const active = entity.unit && alive(entity) &&
      !entity.unit.contained && !entity.unit.release && !this.ignores(entity);

    const priorReservation=this.reservations.get(entity.id);
    const reservation=active&&entity.unit!.detour?.yielding?entity.unit!.detour.waypoint:undefined;
    if(priorReservation!==reservation){
      if(priorReservation!==undefined){const bucket=this.reserved.get(priorReservation)!;bucket.delete(entity);if(!bucket.size)this.reserved.delete(priorReservation);this.reservations.delete(entity.id);}
      if(reservation!==undefined){const bucket=this.reserved.get(reservation)??new Set<Entity>();bucket.add(entity);this.reserved.set(reservation,bucket);this.reservations.set(entity.id,reservation);}
    }
    if (old !== undefined && (!active || old !== cell)) {
      const bucket = this.buckets.get(old)!;
      bucket.delete(entity);
      if (!bucket.size) this.buckets.delete(old);
      this.cells.delete(entity.id);
    }
    if (!active || this.cells.has(entity.id)) return;

    let bucket = this.buckets.get(cell);
    if (!bucket) {
      bucket = new Set();
      this.buckets.set(cell, bucket);
    }
    bucket.add(entity);
    this.cells.set(entity.id, cell);
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
      for (let x = x0; x <= x1; x++) yield* this.inCell(x, y);
    }
  }
}
