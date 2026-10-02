import {createElement,type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Textarea} from './ui/textarea';
import {StudioPanels} from './studioPanels';

/** Mount the existing imperative editor controllers on real, uncontrolled shadcn controls.
 * React owns initial layout; the mature canvas/form controllers own subsequent DOM updates. */
export function mountStudioMarkup(host:HTMLElement,markup:string){
 const template=document.createElement('template');template.innerHTML=markup;
 function node(source:Node,index:number):ReactNode{
  if(source.nodeType===Node.TEXT_NODE)return source.textContent;
  if(!(source instanceof HTMLElement))return null;
  const tag=source.tagName.toLowerCase(),props:Record<string,unknown>={key:index};
  for(const a of source.attributes){const key=({class:'className',for:'htmlFor',tabindex:'tabIndex',spellcheck:'spellCheck',readonly:'readOnly',maxlength:'maxLength'} as Record<string,string>)[a.name]??a.name;props[key]=['hidden','disabled','required','multiple','checked'].includes(a.name)?true:a.value;}
  if(['input','select','textarea'].includes(tag)&&'value' in props){props.defaultValue=props.value;delete props.value;}
  if('checked' in props){props.defaultChecked=props.checked;delete props.checked;}
  if(tag==='option')delete props.selected;
  if(tag==='select'){const selected=source.querySelector('option[selected]') as HTMLOptionElement|null;if(selected)props.defaultValue=selected.value;}
  const children=[...source.childNodes].map(node);
  if(tag==='button')return createElement(Button,{...props,variant:source.classList.contains('primary')||source.classList.contains('cast')?'default':'outline',size:'sm'},...children);
  if(tag==='input'&&!['checkbox','range','color'].includes(source.getAttribute('type')??''))return createElement(Input,props);
  if(tag==='textarea')return createElement(Textarea,{...props,defaultValue:source.textContent??''});
  return createElement(tag,props,...(['input','img','br','hr'].includes(tag)?[]:children));
 }
 let content:ReactNode=[...template.content.childNodes].map(node);
 const parts=[...template.content.children] as HTMLElement[];
 if(host.id==='app'){
  const header=parts.find(p=>p.tagName==='HEADER')!,library=parts.find(p=>p.classList.contains('library'))!,canvas=parts.find(p=>p.tagName==='MAIN')!,inspector=parts.find(p=>p.classList.contains('inspector'))!;
  content=<>{node(header,0)}<StudioPanels workspace="spells" library={node(library,1)} canvas={node(canvas,2)} inspector={node(inspector,3)}/></>;
 }else if(host.classList.contains('effects-workspace')){
  content=<StudioPanels workspace="effects" library={node(parts[0],0)} canvas={node(parts[1],1)} inspector={node(parts[2],2)}/>;
 }
 const root=createRoot(host);flushSync(()=>root.render(content));return root;
}
