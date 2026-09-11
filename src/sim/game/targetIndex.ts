import type {ContentRegistry} from '../../content/registry';
import type {Entity,Point} from './state';
import {precise} from './motion';

/** A combat-planning broad phase. Footprints may overlap several buckets; queries
 * deduplicate them. Exact range/visibility and stable ID ties remain in Combat. */
export class TargetIndex {
  private readonly buckets = new Map<string, Entity[]>();
  private readonly width = 12;
  constructor(entities: readonly Entity[], registry: ContentRegistry) {
    for (const e of entities) {
      const p=precise(e), f=registry.get(e.definition).footprint, rotated=Math.round(e.rotation/90)%2!==0;
      const x=f?(rotated?f.depth:f.width)/2:0,y=f?(rotated?f.width:f.depth)/2:0;
      for(let by=Math.floor((p.y-y)/this.width);by<=Math.floor((p.y+y)/this.width);by++)
        for(let bx=Math.floor((p.x-x)/this.width);bx<=Math.floor((p.x+x)/this.width);bx++){
          const key=`${bx},${by}`,bucket=this.buckets.get(key)??[];bucket.push(e);this.buckets.set(key,bucket);
        }
    }
  }
  near(p:Point,radius:number): Iterable<Entity> {
    const found=new Set<Entity>();
    for(let y=Math.floor((p.y-radius)/this.width);y<=Math.floor((p.y+radius)/this.width);y++)
      for(let x=Math.floor((p.x-radius)/this.width);x<=Math.floor((p.x+radius)/this.width);x++)
        for(const e of this.buckets.get(`${x},${y}`)??[])found.add(e);
    return found;
  }
}
