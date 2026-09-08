import type { BuildingKind } from '../../shared/settlement/rules';
export const ART:Record<BuildingKind,number>={barracks:16,lumberjack:0,sawmill:1,forester:2,stonemason:3,house:4,tower:5,fort:6};
export const DESCRIPTIONS:Record<BuildingKind,string>={
 barracks:'Trains warriors and archers. Each recruit needs one delivered plank and one free settler. No weapons chain required yet.',
 lumberjack:'Cuts trees within your territory and brings raw logs to the hut. Carriers deliver them to sawmills.',
 sawmill:'Turns raw logs into construction planks. Requires a sawyer and log deliveries from lumberjacks.',
 forester:'Replants harvested tree sites. Young trees grow back into a renewable supply of timber.',
 stonemason:'Quarries nearby stone. Carriers collect the stone and deliver it to your main fort.',
 house:'Adds three settlers to your workforce. Unassigned settlers carry goods and can take specialist jobs.',
 tower:'Extends your territory and reveals nearby ground once construction is complete.',
 fort:'Your settlement’s heart and warehouse. Supplies construction and receives finished goods. Losing it ends the match.'
};
export function art(index:number,extra=''){
 if(index>=16){
  const shapes=index===16?'<path d="M14 39V24L32 12l18 12v28H14Z" fill="#473e35"/><path d="M9 26L32 8l23 18-5 5-18-13-18 13Z" fill="#566775"/><path d="M25 52V34h14v18" fill="#111918"/><path d="M20 42l24-24M44 42L20 18" stroke="#c7ced0" stroke-width="3"/>'
   :index===17?'<path d="M12 18l18-6 18 6v18Q44 49 30 56Q16 48 12 36Z" fill="#617a8b" stroke-width="3"/><path d="M30 16v35M16 30h28" stroke="#bdc5c4" stroke-width="3"/><path d="M45 57V13" stroke="#b49362" stroke-width="4"/><path d="M40 17l5-13 5 13Z" fill="#d9dfdc"/>'
   :'<path d="M20 8Q56 32 20 56" stroke="#b08a53" stroke-width="5" fill="none"/><path d="M20 8v48" stroke="#c8c9ae" fill="none"/><path d="M10 32h40" stroke="#c8ad7c" stroke-width="3"/><path d="M46 27l10 5-10 5Z" fill="#d6ddda"/>';
  return `<svg class="rts-military-art ${extra}" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" fill="#111b1c"/><path d="M2 62V2h60v60Z" fill="none" stroke="#718084"/><g stroke="#a2aca7" stroke-linejoin="round">${shapes}</g></svg>`;
 }
 return `<span class="rts-art ${extra}" style="background-position:${index%4*100/3}% ${Math.floor(index/4)*100/3}%" aria-hidden="true"></span>`;}
