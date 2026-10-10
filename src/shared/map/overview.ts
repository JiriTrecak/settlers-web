import type {UtcMap} from './utcmap';
/** Menu data contains no generated world, model references or render state. */
export type MapOverview={name:string;size:number;description?:string;starts:UtcMap['playerStarts'];camps:number;sandbox:boolean;mission?:Pick<NonNullable<UtcMap['mission']>,'campaign'|'order'|'title'|'presentation'>;playable:boolean|null;error?:string;sourceHash:string;image?:string;custom?:boolean};
/** Fast freshness check for preview data, not a lockstep/security fingerprint. */
export function mapSourceHash(raw:string):string{let h=2166136261;for(let i=0;i<raw.length;i++)h=Math.imul(h^raw.charCodeAt(i),16777619);return (h>>>0).toString(16);}
export function mapOverview(map:UtcMap,raw=JSON.stringify(map)):MapOverview{return {name:map.name,size:map.size,description:map.description,starts:map.playerStarts,camps:map.camps.length,sandbox:!!map.sandbox,...(map.mission?{mission:{campaign:map.mission.campaign,order:map.mission.order,title:map.mission.title,presentation:map.mission.presentation}}:{}),playable:null,sourceHash:mapSourceHash(raw)};}
/** Older local saves can be browsed without compiling them. Match loading still
 * performs complete validation before accepting a map into the simulation. */
export function hasPlayableSlots(info:MapOverview):boolean{return info.playable??(info.starts.length>0&&(!!info.mission||info.sandbox||info.starts.some(s=>s.player===1)&&info.starts.some(s=>s.player===2)));}
