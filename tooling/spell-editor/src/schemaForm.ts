/** A complete schema-driven form: objects, unions, optionals, arrays and named rank values. */
export type FieldSchema={type?:string;properties?:Record<string,FieldSchema>;required?:string[];items?:FieldSchema;prefixItems?:FieldSchema[];additionalProperties?:FieldSchema|boolean;anyOf?:FieldSchema[];oneOf?:FieldSchema[];enum?:unknown[];const?:unknown;default?:unknown;minimum?:number;maximum?:number;minItems?:number;maxItems?:number;minLength?:number;maxLength?:number;pattern?:string;description?:string};
export type Choice={id:string;name:string;image?:string};
type Options={choices?:(path:string[])=>Choice[]|undefined;change:()=>void;hidden?:string[]};
export const label=(name:string)=>name.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[-_.]/g,' ').replace(/^./,c=>c.toUpperCase());
const el=(tag:string,className='')=>{const e=document.createElement(tag);e.className=className;return e;};
export function initialValue(s:FieldSchema):any{
 if(s.default!==undefined)return structuredClone(s.default);if(s.const!==undefined)return s.const;if(s.enum)return s.enum[0];
 const union=s.anyOf??s.oneOf;if(union)return initialValue(union[0]);
 if(s.type==='object')return Object.fromEntries(Object.entries(s.properties??{}).filter(([k])=>s.required?.includes(k)).map(([k,v])=>[k,initialValue(v)]));
 if(s.type==='array')return s.prefixItems?s.prefixItems.map(initialValue):Array.from({length:s.minItems??0},()=>initialValue(s.items??{}));
 if(s.type==='boolean')return false;if(s.type==='number'||s.type==='integer')return s.minimum??0;
 return s.pattern?.includes('#')?'#ffffff':s.minLength?'new-value':'';
}
function matches(s:FieldSchema,v:any):boolean{if(s.const!==undefined)return v===s.const;if(s.enum)return s.enum.includes(v);if(s.anyOf)return s.anyOf.some(c=>matches(c,v));if(s.oneOf)return s.oneOf.some(c=>matches(c,v));if(s.type==='object')return !!v&&typeof v==='object'&&!Array.isArray(v)&&Object.entries(s.properties??{}).every(([k,c])=>c.const===undefined||v[k]===c.const);if(s.type==='array')return Array.isArray(v);if(s.type==='integer')return typeof v==='number';return typeof v===s.type;}
function variantName(s:FieldSchema):string{return String(s.properties?.op?.const??s.properties?.kind?.const??(s.properties?.rankParameter?'Rank parameter':s.anyOf?'Operation':s.type==='number'||s.type==='integer'?'Fixed value':label(s.type??'Value')));}
export function schemaForm(schema:FieldSchema,value:any,options:Options):HTMLElement{
 const root=el('div','schema-form');
 function draw(s:FieldSchema,get:()=>any,set:(v:any)=>void,path:string[],host:HTMLElement){
  const union=s.anyOf??s.oneOf;
  if(union){const select=document.createElement('select');select.setAttribute('aria-label',label(path.at(-1)??'Value')+' type');union.forEach((v,i)=>select.add(new Option(label(variantName(v)),String(i))));let i=union.findIndex(c=>matches(c,get()));if(i<0)i=0;select.value=String(i);const sub=el('div','variant-body');host.append(select,sub);draw(union[i],get,set,path,sub);select.onchange=()=>{const next=union[Number(select.value)];set(initialValue(next));sub.replaceChildren();draw(next,get,set,path,sub);options.change();};return;}
  if(s.const!==undefined){const output=el('span','fixed-value');output.textContent=String(s.const);host.append(output);return;}
  if(s.type==='object'){
   for(const [key,field]of Object.entries(s.properties??{})){
    if(options.hidden?.includes([...path,key].join('.')))continue;
    const optional=!s.required?.includes(key);
    if(optional&&field.type==='boolean'){const row=el('div','form-field boolean-field');const heading=el('label');heading.textContent=label(key);const select=document.createElement('select');select.setAttribute('aria-label',label(key));for(const [name,v]of [['Default','default'],['On','true'],['Off','false']])select.add(new Option(name,v));select.value=get()[key]===undefined?'default':String(get()[key]);select.onchange=()=>{if(select.value==='default')delete get()[key];else get()[key]=select.value==='true';options.change();};row.append(heading,select);host.append(row);continue;}
const structured=field.type==='object'||field.type==='array';const row=el(structured?'details':'div',structured?'form-group':'form-field');
    if(structured)(row as HTMLDetailsElement).open=path.length<1;
    const heading=el(structured?'summary':'label');heading.textContent=label(key)+(key.toLowerCase().includes('ticks')?' · ticks (40/s)':'');row.append(heading);
    if(field.type==='boolean')row.classList.add('boolean-field');const body=el('div','field-body');row.append(body);host.append(row);
    const fieldGet=()=>get()?.[key];const fieldSet=(v:any)=>{if(v===undefined)delete get()[key];else get()[key]=v;};
    if(optional){const toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=fieldGet()!==undefined;toggle.setAttribute('aria-label','Enable '+label(key));heading.classList.add('optional-heading');heading.append(toggle);toggle.onclick=e=>e.stopPropagation();toggle.onchange=()=>{fieldSet(toggle.checked?initialValue(field):undefined);body.replaceChildren();if(toggle.checked)draw(field,fieldGet,fieldSet,[...path,key],body);options.change();};}
    if(fieldGet()!==undefined)draw(field,fieldGet,fieldSet,[...path,key],body);
   }
   if(s.additionalProperties&&typeof s.additionalProperties==='object'){
    const entries=el('div');host.append(entries);const refresh=()=>{entries.replaceChildren();for(const key of Object.keys(get()??{})){const row=el('div','record-row'),name=document.createElement('input');name.value=key;name.setAttribute('aria-label','Parameter name');name.onchange=()=>{const next=name.value.trim();if(!/^[a-z][a-zA-Z0-9]*$/.test(next)||next!==key&&Object.hasOwn(get(),next)){name.setCustomValidity('Use a unique camelCase parameter name');name.reportValidity();return;}const v=get()[key];delete get()[key];get()[next]=v;options.change();refresh();};row.append(name);draw(s.additionalProperties as FieldSchema,()=>get()[key],v=>get()[key]=v,[...path,key],row);const remove=document.createElement('button');remove.textContent='×';remove.title='Remove parameter';remove.onclick=()=>{delete get()[key];options.change();refresh();};row.append(remove);entries.append(row);}};refresh();const add=document.createElement('button');add.textContent='+ Parameter';add.onclick=()=>{let i=1;while(Object.hasOwn(get(),'parameter'+i))i++;get()['parameter'+i]=initialValue(s.additionalProperties as FieldSchema);options.change();refresh();};host.append(add);
   }return;
  }
  if(s.type==='array'){
   const list=el('div','form-array');host.append(list);const refresh=()=>{list.replaceChildren();(get()??[]).forEach((_v:any,i:number)=>{const item=el('div','array-item');const head=el('div','array-heading');head.textContent=String(i+1);item.append(head);if(!s.prefixItems){for(const [text,action]of [['↑',()=>{if(i>0)[get()[i-1],get()[i]]=[get()[i],get()[i-1]];}],['↓',()=>{if(i<get().length-1)[get()[i+1],get()[i]]=[get()[i],get()[i+1]];}],['×',()=>get().splice(i,1)]] as const){const b=document.createElement('button');b.textContent=text;b.disabled=text==='×'&&get().length<=(s.minItems??0);b.onclick=()=>{action();options.change();refresh();};head.append(b);}}
    draw(s.prefixItems?.[i]??s.items??{},()=>get()[i],v=>get()[i]=v,[...path,String(i)],item);list.append(item);});};refresh();if(!s.prefixItems){const add=document.createElement('button');add.textContent='+ Add '+label(path.at(-1)??'item');add.onclick=()=>{if(get().length>=(s.maxItems??2048))return;get().push(initialValue(s.items??{}));options.change();refresh();};host.append(add);}return;
  }
  const choices=options.choices?.(path);
  if(s.enum||choices){const select=document.createElement('select');select.setAttribute('aria-label',label(path.at(-1)??''));for(const choice of choices??s.enum!.map(v=>({id:String(v),name:label(String(v))})))select.add(new Option(choice.name,choice.id));if(![...select.options].some(o=>o.value===String(get())))select.add(new Option(String(get()),String(get())));select.value=String(get());host.append(select);select.onchange=()=>{set(select.value);options.change();};return;}
  const input=document.createElement(s.type==='string'&&s.maxLength&&s.maxLength>500?'textarea':'input') as HTMLInputElement;
  input.setAttribute('aria-label',path.map(label).join(' / '));if(s.type==='boolean'){input.type='checkbox';input.checked=get();}else if(s.type==='number'||s.type==='integer'){input.type='number';input.step=s.type==='integer'?'1':'any';if(s.minimum!==undefined)input.min=String(s.minimum);if(s.maximum!==undefined)input.max=String(s.maximum);input.value=String(get());}else{if(input instanceof HTMLInputElement)input.type=s.pattern?.includes('#')?'color':'text';input.value=String(get()??'');if(s.maxLength)input.maxLength=s.maxLength;}
  input.oninput=()=>{set(s.type==='boolean'?input.checked:s.type==='integer'||s.type==='number'?Number(input.value):input.value);options.change();};host.append(input);
 }
 draw(schema,()=>value,()=>{},[],root);return root;
}
