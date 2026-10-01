import './iconPicker.css';

export type IconOption={id:string;name:string;image?:string;keywords?:readonly string[]};
export type IconPickerOptions={label:string;onChange:(id:string)=>void};
let nextPicker=0;
/** Standalone icon field. Catalogue/URLs and persistence belong to the calling editor. */
export class IconPicker {
 readonly element=document.createElement('div');
 private button=document.createElement('button');
 private popup=document.createElement('div');
 private search=document.createElement('input');
 private grid=document.createElement('div');
 private status=document.createElement('div');
 private items:readonly IconOption[]=[];
 private selected='';
 private abort=new AbortController();
 constructor(private options:IconPickerOptions){
  const id=`icon-picker-${++nextPicker}`;
  this.element.className='icon-picker';
  const label=document.createElement('label');label.htmlFor=id;label.textContent=options.label;
  this.button.type='button';this.button.id=id;this.button.className='icon-picker-trigger';
  this.button.setAttribute('aria-haspopup','dialog');this.button.setAttribute('aria-expanded','false');
  this.popup.id=id+'-popup';this.popup.className='icon-picker-popup';this.popup.popover='auto';
  this.popup.setAttribute('role','dialog');this.popup.setAttribute('aria-label',`Choose ${options.label.toLowerCase()}`);
  this.button.setAttribute('aria-controls',this.popup.id);
  const header=document.createElement('div');header.className='icon-picker-header';
  const title=document.createElement('strong');title.textContent='Choose an icon';
  const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','Close icon picker');close.onclick=()=>this.close();header.append(title,close);
  this.search.type='search';this.search.placeholder='Search names or keywords…';this.search.setAttribute('aria-label','Search icons');this.search.autocomplete='off';
  this.grid.className='icon-picker-grid';this.grid.setAttribute('role','group');this.grid.setAttribute('aria-label','Icons');
  this.status.className='icon-picker-status';this.status.setAttribute('role','status');
  this.popup.append(header,this.search,this.grid,this.status);this.element.append(label,this.button,this.popup);
  this.button.onclick=()=>{if(this.popup.matches(':popover-open'))this.close();else{this.search.value='';this.renderGrid();this.popup.showPopover();this.position();this.search.focus();}};
  this.popup.addEventListener('toggle',()=>this.button.setAttribute('aria-expanded',String(this.popup.matches(':popover-open'))));
  this.search.addEventListener('input',e=>{e.stopPropagation();this.renderGrid();});
  this.popup.addEventListener('keydown',e=>{
   // Do not trigger the hosting editor's Q/R/Space shortcuts inside the chooser.
   e.stopPropagation();
   if(e.key==='Escape'){e.preventDefault();this.close();return;}
   const buttons=Array.from(this.grid.querySelectorAll('button'));
   if(e.target===this.search){if(e.key==='ArrowDown'){e.preventDefault();buttons[0]?.focus();}return;}
   const index=buttons.indexOf(e.target as HTMLButtonElement);if(index<0)return;
   const columns=getComputedStyle(this.grid).gridTemplateColumns.split(' ').length;
   const next=e.key==='ArrowRight'?index+1:e.key==='ArrowLeft'?index-1:e.key==='ArrowDown'?index+columns:e.key==='ArrowUp'?index-columns:e.key==='Home'?0:e.key==='End'?buttons.length-1:undefined;
   if(next!==undefined){e.preventDefault();buttons[Math.max(0,Math.min(buttons.length-1,next))]?.focus();}
  });
  window.addEventListener('resize',()=>{if(this.popup.matches(':popover-open'))this.position();},{signal:this.abort.signal});
  // Tab leaves the non-modal picker normally; dismiss once focus leaves it.
  this.popup.addEventListener('focusout',()=>queueMicrotask(()=>{if(this.popup.matches(':popover-open')&&!this.popup.contains(document.activeElement)&&document.activeElement!==this.button)this.popup.hidePopover();}));
  this.renderSelected();
 }
 get value(){return this.selected;}
 set value(id:string){this.selected=id;this.renderSelected();if(this.popup.matches(':popover-open'))this.renderGrid();}
 setItems(items:readonly IconOption[]){this.items=items;this.renderSelected();this.renderGrid();}
 private artwork(item:IconOption){
  const box=document.createElement('span');box.className='icon-picker-art';box.textContent='✦';
  if(item.image){const image=document.createElement('img');image.src=item.image;image.alt='';image.loading='lazy';image.onerror=()=>image.remove();box.replaceChildren(image);}
  return box;
 }
 private renderSelected(){
  const item=this.items.find(i=>i.id===this.selected)??{id:this.selected,name:this.selected||'Default unit icon'};
  const name=document.createElement('span');name.className='icon-picker-name';name.textContent=item.name;
  const chevron=document.createElement('span');chevron.textContent='⌄';chevron.setAttribute('aria-hidden','true');
  this.button.replaceChildren(this.artwork(item),name,chevron);this.button.title=item.name;
  this.button.setAttribute('aria-label',`${this.options.label}: ${item.name}`);
 }
 private renderGrid(){
  const tokens=this.search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches=this.items.filter(item=>{const text=[item.name,item.id,...item.keywords??[]].join(' ').toLocaleLowerCase();return tokens.every(token=>text.includes(token));});
  this.grid.replaceChildren();
  for(const item of matches){
   const b=document.createElement('button');b.type='button';b.className='icon-picker-option';b.title=[item.name,...item.keywords??[]].join(' · ');b.setAttribute('aria-label',item.name);b.setAttribute('aria-pressed',String(item.id===this.selected));
   const name=document.createElement('span');name.textContent=item.name;b.append(this.artwork(item),name);
   b.onclick=()=>{this.value=item.id;this.close();this.options.onChange(item.id);};this.grid.append(b);
  }
  this.status.textContent=matches.length?`${matches.length} ${matches.length===1?'icon':'icons'} · Arrow keys to browse, Enter to select`:'No icons found. Try another name or keyword.';
 }
 private position(){
  const rect=this.button.getBoundingClientRect(),width=Math.min(440,window.innerWidth-24);
  this.popup.style.width=width+'px';this.popup.style.maxHeight=Math.max(160,window.innerHeight-24)+'px';
  this.popup.style.left=Math.max(12,Math.min(rect.right-width,window.innerWidth-width-12))+'px';
  this.popup.style.top=Math.max(12,Math.min(rect.bottom+8,window.innerHeight-this.popup.getBoundingClientRect().height-12))+'px';
 }
 private close(){this.popup.hidePopover();this.button.focus();}
 dispose(){this.abort.abort();this.popup.remove();this.element.remove();}
}
