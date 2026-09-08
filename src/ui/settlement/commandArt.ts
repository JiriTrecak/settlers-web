import type { BuildingKind } from '../../shared/settlement/rules';
export const ART:Record<BuildingKind,number>={lumberjack:0,sawmill:1,forester:2,stonemason:3,house:4,tower:5,fort:6};
export const DESCRIPTIONS:Record<BuildingKind,string>={
 lumberjack:'Cuts trees within your territory and brings raw logs to the hut. Carriers deliver them to sawmills.',
 sawmill:'Turns raw logs into construction planks. Requires a sawyer and log deliveries from lumberjacks.',
 forester:'Replants harvested tree sites. Young trees grow back into a renewable supply of timber.',
 stonemason:'Quarries nearby stone. Carriers collect the stone and deliver it to your main fort.',
 house:'Adds three settlers to your workforce. Unassigned settlers carry goods and can take specialist jobs.',
 tower:'Extends your territory and reveals nearby ground once construction is complete.',
 fort:'Your settlement’s heart and warehouse. Supplies construction and receives finished goods. Losing it ends the match.'
};
export function art(index:number,extra=''){return `<span class="rts-art ${extra}" style="background-position:${index%4*100/3}% ${Math.floor(index/4)*100/3}%" aria-hidden="true"></span>`;}
