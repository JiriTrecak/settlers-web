import type {Entity,Point} from './state';
import {precise} from './motion';
/** World yaw in degrees: +Z forward. The shortest turn has a stable clockwise tie. */
export function heading(e:Entity,target:Point):number {
 const p=precise(e),dx=target.x-p.x,dy=target.y-p.y;
 return dx*dx+dy*dy<1e-10?e.rotation:(Math.atan2(dx,dy)*180/Math.PI+360)%360;
}
export function turnDifference(from:number,to:number):number {
 const d=((to-from)%360+360)%360;return d>180?d-360:d;
}
export function facing(e:Entity,target:Point):boolean {
 return Math.abs(turnDifference(e.rotation,heading(e,target)))<=1;
}
export function turnToward(e:Entity,target:Point,degreesPerTick:number):boolean {
 const desired=heading(e,target),difference=turnDifference(e.rotation,desired);
 e.rotation=Math.round(((e.rotation+Math.max(-degreesPerTick,Math.min(degreesPerTick,difference))+360)%360)*1000)/1000;
 return Math.abs(difference)<=degreesPerTick+1;
}
