import type {ContentRegistry} from '../../content/registry';
import type {Entity,Point} from './state';
import {precise} from './motion';

/** A combat-planning broad phase. Footprints may overlap several buckets; queries
 * deduplicate them. Exact range/visibility and stable ID ties remain in Combat. */
export class TargetIndex {
  private readonly rows = new Map<number, Map<number, Entity[]>>();
  private readonly occupied: Entity[][] = [];
  private readonly width = 12;
  constructor(entities: readonly Entity[], private readonly registry: ContentRegistry) {
    this.refresh(entities);
  }
  /** Reuse bucket storage, but rebuild membership in input order each planning
   * pass. Movement, death, ownership and restored entity identities stay live.
   * Numeric coordinates avoid string keys and also support off-map queries. */
  refresh(entities: readonly Entity[]) {
    for(const bucket of this.occupied)bucket.length=0;
    this.occupied.length=0;
    for (const e of entities) {
      const p=precise(e), d=this.registry.get(e.definition),f=d.footprint, rotated=Math.round(e.rotation/90)%2!==0;
      const radius=e.unit?d.dimensions!.radius:0;
      const x=f?(rotated?f.depth:f.width)/2:radius,y=f?(rotated?f.width:f.depth)/2:radius;
      for(let by=Math.floor((p.y-y)/this.width);by<=Math.floor((p.y+y)/this.width);by++)
        for(let bx=Math.floor((p.x-x)/this.width);bx<=Math.floor((p.x+x)/this.width);bx++){
          let row=this.rows.get(by);
          if(!row){row=new Map();this.rows.set(by,row);}
          let bucket=row.get(bx);
          if(!bucket){bucket=[];row.set(bx,bucket);}
          if(!bucket.length)this.occupied.push(bucket);
          bucket.push(e);
        }
    }
  }
  near(p:Point,radius:number): Iterable<Entity> {
    const found=new Set<Entity>();
    for(let y=Math.floor((p.y-radius)/this.width);y<=Math.floor((p.y+radius)/this.width);y++){
      const row=this.rows.get(y);if(!row)continue;
      for(let x=Math.floor((p.x-radius)/this.width);x<=Math.floor((p.x+radius)/this.width);x++){
        const bucket=row.get(x);if(bucket)for(const e of bucket)found.add(e);
      }
    }
    return found;
  }
}
