/** Timer cadence only; never changes simulation ticks or lockstep input order. */
export function simulationWakeDelay(acc:number,speed:number,elapsed:number,paused:boolean,waiting:boolean,step=25):number {
 // Missing commits/desync cannot be solved by a zero-delay polling loop. Network
 // arrivals wake the worker immediately; keep one tick as a fallback poll.
 if(waiting)return Math.max(1,step/speed);
 const available=acc+(paused?0:Math.max(0,elapsed)*speed);
 return available>=step?0:Math.max(1,(step-available)/speed);
}
