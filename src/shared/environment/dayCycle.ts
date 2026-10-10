import winterDay from './winterDay.json';
import source from './daytimes.json';
export type DaytimeId='day'|'day_to_night'|'night'|'night_to_day';
export type DaytimeColor={rgb:number[];alpha:number;multiplier:number};
export type DaytimeLook={ambient:DaytimeColor;skyColor:DaytimeColor;sunColor:DaytimeColor;sunDirection:number[];skyBloomColor:DaytimeColor|null;fog:{color:DaytimeColor;density:number;dispersionByHeight:number;startDist:number;startHeight:number};colorize:{color:DaytimeColor;radialFactorScale:number};textureColorLUT:string};
/** Two outdoor palettes; the biome applies its authored tints and intensities. */
export const DAYTIME_LOOKS:Readonly<Record<'day'|'night',DaytimeLook>>=source;
export const DAY_CYCLE_SECONDS=600;
/** Ten-second blends in a ten-minute cycle. Dawn/dusk are phases, not extra palettes. */
export const DAY_PHASES={dawnStart:5.8,dawnPeak:6,dawnEnd:6.2,duskStart:17.8,duskPeak:18,duskEnd:18.2} as const;
export type DaytimeSample={profile?:'temperate'|'winter';phase:DaytimeId;from:DaytimeId;to:DaytimeId;blend:number;look:DaytimeLook;lutWeights:{path:string;weight:number}[]};
export const wrap24=(hour:number)=>Number.isFinite(hour)?((hour%24)+24)%24:0;
const linear=(v:number)=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;};
const srgb=(v:number)=>255*(v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055);
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const mixColor=(a:DaytimeColor,b:DaytimeColor,t:number):DaytimeColor=>({rgb:a.rgb.map((v,i)=>srgb(lerp(linear(v),linear(b.rgb[i]),t))),alpha:lerp(a.alpha,b.alpha,t),multiplier:lerp(a.multiplier,b.multiplier,t)});
const transparent:DaytimeColor={rgb:[0,0,0],alpha:0,multiplier:0};
const WINTER_LOOKS={...DAYTIME_LOOKS,day:winterDay};
const hold=(id:'day'|'night',looks=DAYTIME_LOOKS):DaytimeSample=>({phase:id,from:id,to:id,blend:0,look:looks[id],lutWeights:[{path:looks[id].textureColorLUT,weight:1}]});
const HOLDS={day:hold('day'),night:hold('night')};
const WINTER_HOLDS=Object.fromEntries(Object.keys(HOLDS).map(id=>[id,{...hold(id as 'day'|'night',WINTER_LOOKS),profile:'winter' as const}])) as typeof HOLDS;
export function sampleDaytime(hour:number,profile:'temperate'|'winter'='temperate'):DaytimeSample {
 const holds=profile==='winter'?WINTER_HOLDS:HOLDS,looks=profile==='winter'?WINTER_LOOKS:DAYTIME_LOOKS;
 const h=wrap24(hour),p=DAY_PHASES;
 if(h>=p.dawnEnd&&h<=p.duskStart)return holds.day;
 if(h>=p.duskEnd||h<=p.dawnStart)return holds.night;
 const dawn=h<p.dawnEnd,start=dawn?p.dawnStart:p.duskStart,end=dawn?p.dawnEnd:p.duskEnd;
 const middle:DaytimeId=dawn?'night_to_day':'day_to_night';
 const from=dawn?'night':'day',to=dawn?'day':'night';
 const raw=(h-start)/(end-start),t=raw*raw*(3-2*raw);
 const a=looks[from],b=looks[to],num=(x:number,y:number)=>lerp(x,y,t);
 return {profile,phase:middle,from,to,blend:t,lutWeights:[{path:a.textureColorLUT,weight:1-t},{path:b.textureColorLUT,weight:t}],look:{
  ambient:mixColor(a.ambient,b.ambient,t),skyColor:mixColor(a.skyColor,b.skyColor,t),sunColor:mixColor(a.sunColor,b.sunColor,t),
  sunDirection:a.sunDirection.map((v,i)=>num(v,b.sunDirection[i])),skyBloomColor:mixColor(a.skyBloomColor??transparent,b.skyBloomColor??transparent,t),
  fog:{color:mixColor(a.fog.color,b.fog.color,t),density:num(a.fog.density,b.fog.density),dispersionByHeight:num(a.fog.dispersionByHeight,b.fog.dispersionByHeight),startDist:num(a.fog.startDist,b.fog.startDist),startHeight:num(a.fog.startHeight,b.fog.startHeight)},
  colorize:{color:mixColor(a.colorize.color,b.colorize.color,t),radialFactorScale:num(a.colorize.radialFactorScale,b.colorize.radialFactorScale)},textureColorLUT:t<.5?a.textureColorLUT:b.textureColorLUT,
 }};
}
export function daytimeLabel(hour:number){return {day:'Day',night:'Night',day_to_night:'Dusk',night_to_day:'Dawn'}[sampleDaytime(hour).phase];}

/** Continuous stylized sun/moon orbit, independent of the held colour palette.
 * The light stays above the horizon so RTS shadows remain readable through the handoff. */
export function daytimeDirection(hour:number):[number,number,number] {
 const phase=(wrap24(hour)-12)*Math.PI/12,azimuth=-Math.PI/4+phase;
 const elevation=(50+10*Math.cos(phase*2))*Math.PI/180;
 return [Math.cos(elevation)*Math.sin(azimuth),Math.sin(elevation),Math.cos(elevation)*Math.cos(azimuth)];
}
