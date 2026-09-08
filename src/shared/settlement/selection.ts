import { isSoldier } from './rules';
/** Area selection only considers owned, visible units. Armies take priority. */
export function areaSelection<T extends {id:number;owner:number;role:string;health:number;job:string}>(units:readonly T[],owner:number):number[] {
  const own=units.filter(w=>w.owner===owner&&w.health>0&&w.job!=='training');
  const army=own.filter(w=>isSoldier(w.role));
  return (army.length?army:own).map(w=>w.id).sort((a,b)=>a-b);
}
export function formationOffset(index:number,count:number):{x:number;z:number} {
  const columns=Math.ceil(Math.sqrt(count)),rows=Math.ceil(count/columns);
  return {x:(index%columns)*2-(columns-1),z:Math.floor(index/columns)*2-(rows-1)};
}
