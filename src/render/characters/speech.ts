/** Silent text-paced articulation, not phoneme/voice synchronization. */
export function speechEnvelope(text:string,elapsed:number,duration:number):number {
 if(!text.length||duration<=0||elapsed<0||elapsed>=duration)return 0;
 const position=elapsed/duration*text.length,index=Math.floor(position),letter=text[index]!,phase=position-index;
 if(/[\s.,!?;:—]/.test(letter))return 0;
 const emphasis=/[aeiouy]/i.test(letter)?1:.55;
 return Math.sin(Math.PI*phase)*emphasis*Math.min(1,elapsed*6,(duration-elapsed)*6);
}
