import type {Rules} from './schema';
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
