import {overviewOf,type MapEntry} from '../../shared/map/library';
import {playerCss} from '../../shared/player/player';
const NS='http://www.w3.org/2000/svg';
const placeholder='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#17241e"/><path d="M0 128H512M0 256H512M0 384H512M128 0V512M256 0V512M384 0V512" stroke="#273b30"/><text x="256" y="250" text-anchor="middle" fill="#a6b8a6" font-family="sans-serif" font-size="18">Preview not published</text></svg>');
/** Menus only compose an image and a few starting-position markers. Never compile
 * a map, sample terrain, load models or allocate a WebGL/canvas renderer here. */
export function mapPreview(entry:MapEntry,human:number|null,thumbnail=false):HTMLDivElement{
 const info=overviewOf(entry),root=document.createElement('div');root.className='map-atlas';
 root.setAttribute('role','img');root.setAttribute('aria-label',`${entry.name} terrain and starting positions`);
 const image=document.createElement('img');image.src=entry.previewUrl??placeholder;image.alt='';image.width=image.height=512;image.decoding='async';image.loading=thumbnail?'lazy':'eager';
 image.onerror=()=>{image.onerror=null;image.src=placeholder;};root.append(image);
 if(info.custom)return root;
 const svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 512 512');svg.setAttribute('aria-hidden','true');
 for(const start of info.starts){
  const x=start.x/info.size*512,y=start.z/info.size*512,active=start.player-1===human;
  const group=document.createElementNS(NS,'g');group.setAttribute('transform',`translate(${x} ${y})`);
  const halo=document.createElementNS(NS,'circle');halo.setAttribute('r',active?'15':'12');halo.setAttribute('fill','#11221dc9');halo.setAttribute('stroke',active?'#fff0b1':'#111b15');halo.setAttribute('stroke-width','2');
  const cross=document.createElementNS(NS,'path');cross.setAttribute('d','M-7 -7L7 7M7 -7L-7 7');cross.setAttribute('stroke',playerCss(start.player-1));cross.setAttribute('stroke-width','5');cross.setAttribute('stroke-linecap','round');
  const label=document.createElementNS(NS,'text');label.setAttribute('y',y>480?'-20':'29');label.setAttribute('text-anchor','middle');label.setAttribute('fill','#fff2d0');label.setAttribute('stroke','#172119');label.setAttribute('stroke-width','3');label.setAttribute('paint-order','stroke');label.setAttribute('font-size','13');label.setAttribute('font-family','system-ui');label.setAttribute('font-weight','700');label.textContent=`P${start.player}`;
  group.append(halo,cross,label);svg.append(group);
 }
 root.append(svg);return root;
}
