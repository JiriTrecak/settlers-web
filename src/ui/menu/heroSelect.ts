import {content} from '../../content/builtin';
import type {HeroChoice} from '../../content/startingHero';
/** Local and remote setup present the same declared hero catalogue. */
export function heroSelect(policy:HeroChoice,value:string,onChange:(id:string)=>void,label:string) {
 const select=document.createElement('select');select.className='skirmish-hero-select';
 select.setAttribute('aria-label',label);select.title='Starting hero';
 for(const id of policy.choices){const option=document.createElement('option');option.value=id;option.textContent=content.find(id)?.name??id;select.append(option);}
 select.value=value;select.onchange=()=>onChange(select.value);return select;
}
