/** Compact race selector shared by local and remote lobbies. */
export function raceSelect(races:Record<string,{name:string}>,value:string,onChange:(id:string)=>void,label:string){
 const select=document.createElement('select');select.className='skirmish-race-select';select.setAttribute('aria-label',label);select.title='Race';
 for(const [id,r] of Object.entries(races)){const option=document.createElement('option');option.value=id;option.textContent=r.name;select.append(option);}
 select.value=value;select.onchange=()=>onChange(select.value);return select;
}
