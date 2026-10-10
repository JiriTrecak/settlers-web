import type { SkyState } from '../sky/sky';

const smooth = (a:number,b:number,x:number) => {
  const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);
};
/** A continuous orbit: noon is overhead, dawn/dusk cross the horizon. */
export function clockDisplay(hour:number) {
  const h=((Number.isFinite(hour)?hour:0)%24+24)%24;
  const angle=(h-12)*Math.PI/12,elevation=Math.cos(angle);
  const x=Math.sin(angle)*22,y=elevation*22;
  return {
    sun:{x:32+x,y:38-y,opacity:smooth(-.2,.2,elevation)},
    moon:{x:32-x,y:38+y,opacity:smooth(-.2,.2,-elevation)},
    daylight:smooth(-.3,.35,elevation),
    twilight:1-smooth(0,.45,Math.abs(elevation)),
  };
}
let nextDial=0;

/** Borderless sky dial shared by the game HUD and editor minimap. */
export class DayNightIndicator {
  readonly root=document.createElement('div');
  private readonly sun:SVGElement;
  private readonly moon:SVGElement;
  private readonly day:SVGElement;
  private readonly dusk:SVGElement;
  private readonly stars:SVGElement;
  private lastHour=NaN;
  private lastLabel='';

  constructor(host:HTMLElement) {
    const id=`sky-dial-${nextDial++}`;
    this.root.style.cssText='position:absolute;left:2px;top:2px;width:64px;height:64px;pointer-events:auto;cursor:default;';
    this.root.setAttribute('role','img');
    this.root.innerHTML=`<svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true" style="display:block;overflow:visible;filter:drop-shadow(0 2px 4px #0008)">
      <defs>
        <radialGradient id="${id}-edge"><stop offset="75%" stop-color="white"/><stop offset="100%" stop-color="black"/></radialGradient>
        <mask id="${id}-mask"><circle cx="32" cy="32" r="31" fill="url(#${id}-edge)"/></mask>
        <linearGradient id="${id}-night" x2="0" y2="1"><stop stop-color="#0d142f"/><stop offset="1" stop-color="#354968"/></linearGradient>
        <linearGradient id="${id}-day" x2="0" y2="1"><stop stop-color="#286383"/><stop offset="1" stop-color="#b8d9c7"/></linearGradient>
        <linearGradient id="${id}-dusk" x2="0" y2="1"><stop stop-color="#373654"/><stop offset="1" stop-color="#d99863"/></linearGradient>
      </defs>
      <g mask="url(#${id}-mask)">
        <circle cx="32" cy="32" r="31" fill="url(#${id}-night)"/>
        <circle data-day cx="32" cy="32" r="31" fill="url(#${id}-day)"/>
        <circle data-dusk cx="32" cy="32" r="31" fill="url(#${id}-dusk)"/>
        <g data-stars fill="#d6e4ff"><circle cx="15" cy="22" r=".9"/><circle cx="26" cy="10" r=".7"/><circle cx="48" cy="21" r="1"/><circle cx="43" cy="9" r=".7"/><circle cx="18" cy="36" r=".6"/></g>
        <g data-sun fill="none" stroke="#ffe5a0" stroke-width="1.7" stroke-linecap="round">
          <circle r="12" fill="#ffd06a" opacity=".12" stroke="none"/><circle r="6" fill="#ffda78"/>
          <path d="M0-12v3m0 18v3M-12 0h3m18 0h3M-8.5-8.5l2 2m13 13 2 2M-8.5 8.5l2-2m13-13 2-2"/>
        </g>
        <g data-moon fill="#e1eaff" stroke="#f0f4ff" stroke-width="1" stroke-linejoin="round">
          <path d="M2-9A10 10 0 1 0 9 6 10 10 0 0 1 2-9Z"/>
        </g>
      </g>
    </svg>`;
    this.sun=this.root.querySelector('[data-sun]')!;
    this.moon=this.root.querySelector('[data-moon]')!;
    this.day=this.root.querySelector('[data-day]')!;
    this.dusk=this.root.querySelector('[data-dusk]')!;
    this.stars=this.root.querySelector('[data-stars]')!;
    host.append(this.root);
  }

  update(state:SkyState):void {
    if(state.hour!==this.lastHour){
      this.lastHour=state.hour;
      const view=clockDisplay(state.hour);
      for(const [element,body] of [[this.sun,view.sun],[this.moon,view.moon]] as const){
        element.setAttribute('transform',`translate(${body.x.toFixed(3)} ${body.y.toFixed(3)})`);
        element.style.opacity=String(body.opacity);
      }
      this.day.style.opacity=String(view.daylight);
      this.dusk.style.opacity=String(view.twilight*.8);
      this.stars.style.opacity=String(1-view.daylight);
    }
    const label=`${state.label}${state.playing?'':' · Day cycle paused'}`;
    if(label!==this.lastLabel){this.lastLabel=label;this.root.title=label;this.root.setAttribute('aria-label',label);}
  }
}
