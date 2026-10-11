import type {Rules,Placement} from './schema';
import type {ContentRegistry} from './registry';
export type HeroChoice = Pick<NonNullable<Rules['startingSetup']['hero']>,'default'|'choices'>;
/** Used at authoring/setup boundaries. Runtime movement never reads presentation scale. */
export function chosenHero(policy: HeroChoice | undefined, selected?: string): string | undefined {
 if(!policy){if(selected!==undefined)throw new Error('This setup has no starting hero choice');return;}
 const id=selected??policy.default;
 if(!policy.choices.includes(id))throw new Error(`Unavailable starting hero: ${id}`);
 return id;
}
export function startingUnits(setup:Rules['startingSetup'],selected?:string) {
 const id=chosenHero(setup.hero,selected);
 return [...setup.units,...(id?[{definition:id,offset:setup.hero!.offset}]:[])];
}

/** Rotate in the same clockwise x/y convention as building entrances. The
 * navigation-centre bias rotates with the formation, preserving point symmetry
 * around half-cell Hall centres instead of rounding both sides toward +infinity. */
export function startingUnitPosition(start: {x:number;z:number;rotation?:number}, offset:{x:number;y:number}) {
 const quarter=((start.rotation ?? 0)/90)%4;
 if(!Number.isInteger(quarter))throw new Error('Starting formations rotate in 90-degree steps');
 const i=(quarter+4)%4,x=offset.x+Math.round(start.x)-start.x,y=offset.y+Math.round(start.z)-start.z;
 return {x:start.x+[x,y,-x,-y][i]!,y:start.z+[y,-x,-y,x][i]!};
}

/** Face the primary gathering resource, independently of the hall's model facing.
 * Quarter turns preserve the formation's declared grid spacing and opposite hero
 * offset. Distance then placement ID gives every peer the same result. */
export function startingFormationRotation(start:{x:number;z:number;rotation?:number},setup:Rules['startingSetup'],resources:readonly Placement[],registry:ContentRegistry):number {
 const gathering=registry.get(setup.fort).behaviors.storage?.gathering??setup.gathering?.[0];
 const recipe=gathering&&registry.get(gathering.item).creation;
 if(!gathering||recipe?.method!=='harvest')return start.rotation??0;
 const distance=(p:Placement)=>(p.position.x-start.x)**2+(p.position.y-start.z)**2;
 const source=resources.filter(p=>p.definition===recipe.source&&p.owner==='none'&&!p.activation&&
  (p.initialState?.amount??registry.get(p.definition).yield??0)>0&&distance(p)<=gathering.radius**2)
  .sort((a,b)=>distance(a)-distance(b)||(a.id<b.id?-1:a.id>b.id?1:0))[0];
 if(!source)return start.rotation??0;
 const dx=source.position.x-start.x,dz=source.position.y-start.z;
 if(dx===0&&dz===0)return start.rotation??0;
 return Math.abs(dx)>Math.abs(dz)?(dx>0?90:270):(dz>0?0:180);
}
