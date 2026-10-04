/** Sample the authored weapon clip around the authoritative release tick. */
export function attackPhase(tick:number,attack:{started:number;impact:number;ends:number},contact:number){
 return Math.max(0,Math.min(1,tick<=attack.impact
  ?contact*Math.max(0,tick-attack.started)/Math.max(1,attack.impact-attack.started)
  :contact+(1-contact)*(tick-attack.impact)/Math.max(1,attack.ends-attack.impact)));
}
