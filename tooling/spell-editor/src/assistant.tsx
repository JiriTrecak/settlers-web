import {useEffect,useMemo,useRef,useState} from 'react';
import {studioClient} from './client';
import {createRoot} from 'react-dom/client';
import {createPortal} from 'react-dom';
import {useEveAgent} from 'eve/react';
import {ChatMarkdown} from './chatMarkdown';
import {Sparkles,Settings2,Plus,ArrowUp,Square,X,KeyRound,Camera,Check,Loader2,ChevronDown} from 'lucide-react';
import {Button} from './components/ui/button';
import {Input} from './components/ui/input';
import {Textarea} from './components/ui/textarea';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from './components/ui/dialog';
import type {CanvasAction} from '../server/canvasBridge';

type Context={workspace:'spells'|'effects';id:string;dirty:boolean};
type Settings={model:string;imageModel:string;configured:boolean;available:boolean;storage:string};
type Bridge={token:string;context:()=>Context;canvas:(action:CanvasAction)=>Promise<Context&{image?:string}>};
const labels:Record<string,string>={studio_schema:'Reading engine schema',studio_author:'Working with the editor',studio_canvas:'Inspecting canvas',studio_image:'Generating image',studio_asset_image:'Inspecting published image'};

export function mountAssistant(bridge:Bridge){
 const client=studioClient;
 const previousEpoch=sessionStorage.getItem('studio-epoch');if(previousEpoch!==bridge.token)sessionStorage.removeItem('studio-chat');sessionStorage.setItem('studio-epoch',bridge.token);
 const headers={'Content-Type':'application/json','X-Spell-Token':bridge.token,'X-Studio-Client':client};
 const request=async(path:string,method='GET',body?:unknown)=>{const response=await fetch('/__spells/'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw Error(data.error??'Editor request failed');return data;};
 let alive=true;const handled=new Set<string>();
 const poll=async()=>{try{for(const action of await request('canvas')){if(handled.has(action.requestId))continue;handled.add(action.requestId);try{await request('canvas','POST',{id:action.requestId,result:await bridge.canvas(action)});}catch(e){await request('canvas','POST',{id:action.requestId,error:e instanceof Error?e.message:String(e)});}finally{setTimeout(()=>handled.delete(action.requestId),60000);}}}catch{}if(alive)setTimeout(poll,500);};void poll();
 window.addEventListener('beforeunload',()=>{alive=false;});
 const toolbar=document.createElement('div');toolbar.className='studio-assistant-toolbar';document.querySelector('#app > header')!.append(toolbar);
 const host=document.createElement('div');host.id='assistant-root';document.body.append(host);
 function Assistant(){
  const [open,setOpen]=useState(sessionStorage.getItem('studio-chat-open')==='true'),[settingsOpen,setSettingsOpen]=useState(false),[settings,setSettings]=useState<Settings|null>(null),[key,setKey]=useState(''),[saving,setSaving]=useState(false),[settingsError,setSettingsError]=useState(''),[input,setInput]=useState(''),[localError,setLocalError]=useState('');
  const options=useMemo(()=>{let initialSession;try{initialSession=JSON.parse(sessionStorage.getItem('studio-chat')??'null')??undefined;}catch{}return {host:location.origin+'/__spells/agent',headers,initialSession,resume:!!initialSession,onSessionChange:(session:{sessionId:string;streamIndex:number}|undefined)=>{if(session)sessionStorage.setItem('studio-chat',JSON.stringify({...session,streamIndex:0}));else sessionStorage.removeItem('studio-chat');}};},[]);
  const agent=useEveAgent(options),busy=agent.status==='submitted'||agent.status==='streaming'||agent.status==='resuming';
  const error=localError||agent.error?.message;
  const errorMessage=error==='The session is no longer active.'?'This conversation has ended. Use + to start a new conversation and continue from the current draft. Your spells and effects are preserved.':error;
  const [context,setContext]=useState(bridge.context);
  useEffect(()=>{const timer=setInterval(()=>{const next=bridge.context();setContext(previous=>previous.id===next.id&&previous.workspace===next.workspace&&previous.dirty===next.dirty?previous:next);},500);return()=>clearInterval(timer);},[]);
  const messagesEnd=useRef<HTMLDivElement>(null);
  useEffect(()=>{document.body.classList.toggle('assistant-open',open);sessionStorage.setItem('studio-chat-open',String(open));},[open]);
  useEffect(()=>{messagesEnd.current?.scrollIntoView({behavior:'smooth',block:'end'});},[agent.data.messages,agent.status]);
  useEffect(()=>{void request('settings').then(setSettings).catch(e=>setSettingsError(e.message));},[]);
  const send=async(text=input)=>{if(!text.trim()||busy)return;if(!settings?.configured){setSettingsOpen(true);return;}setLocalError('');setInput('');try{await agent.send(text.trim());}catch(e){setLocalError(e instanceof Error?e.message:String(e));}};
  const save=async()=>{setSaving(true);setSettingsError('');try{setSettings(await request('settings','PUT',{model:settings?.model??'gpt-6.1-sol',imageModel:settings?.imageModel??'gpt-image-2.5-sunburst',...(key.trim()?{apiKey:key.trim()}:{})}));setKey('');agent.reset();setSettingsOpen(false);}catch(e){setSettingsError(e instanceof Error?e.message:String(e));}finally{setSaving(false);}};
  return <>
   {createPortal(<><Button variant={open?'secondary':'ghost'} size="sm" onClick={()=>setOpen(v=>!v)}><Sparkles/>Assistant</Button><Button variant="ghost" size="icon" aria-label="Settings" title="Settings" onClick={()=>setSettingsOpen(true)}><Settings2/></Button></>,toolbar)}
   <aside className="assistant-panel" hidden={!open} aria-label="Authoring assistant">
    <div className="assistant-heading"><span><Sparkles size={16}/>Authoring assistant</span><div><Button variant="ghost" size="icon" title="New conversation" aria-label="New conversation" disabled={busy} onClick={()=>{agent.reset();setLocalError('');}}><Plus/></Button><Button variant="ghost" size="icon" aria-label="Close assistant" onClick={()=>setOpen(false)}><X/></Button></div></div>
    <div className="assistant-context" title={context.id}><span className="status-dot"/>{context.workspace==='effects'?'Effect':'Spell'}{context.dirty?' · Unsaved draft':''}<span>{settings?.model??'OpenAI'}</span></div>
    <div className="assistant-messages" role="log" aria-live="polite">
     {!agent.data.messages.length&&<div className="assistant-empty"><div className="assistant-orb"><Sparkles size={24}/></div><h2>Build something magical.</h2><p>Create spells, shape effects, and refine them together on the canvas.</p>{!settings?.configured?<Button onClick={()=>setSettingsOpen(true)}><KeyRound/>Connect OpenAI</Button>:<div className="assistant-suggestions">{['Inspect the current effect and suggest improvements.','Create a healing spell with a warm golden burst.','Generate a transparent ground symbol for an aura.'].map(text=><Button key={text} variant="outline" onClick={()=>void send(text)}>{text}</Button>)}</div>}</div>}
     {agent.data.messages.map(message=><article className={'chat-message '+message.role} key={message.id}><div className="chat-role">{message.role==='user'?'You':'Assistant'}</div>{message.parts.map((part,index)=>{
      if(part.type==='text')return <ChatMarkdown key={index} text={part.text}/>;
      if(part.type==='dynamic-tool'){
       if(part.toolName==='session_limit_continuation')return <p className="chat-error" role="status" key={index}>This conversation reached its session limit. Start a new conversation with the + button to continue. Saved spells and effects are preserved.</p>;
       const output=part.output as {image?:string;error?:string}|undefined;const {image,...metadata}=output??{};
       return <details className="chat-tool" key={index}><summary>{part.state==='output-available'?<Check size={13}/>:part.state==='output-error'?<X size={13}/>:<Loader2 className="animate-spin" size={13}/>}<span>{labels[part.toolName]??part.toolName}</span><ChevronDown size={13}/></summary>{image&&<img className="chat-image" src={image} alt="Tool image result"/>}<pre>{part.state==='output-error'?part.errorText:JSON.stringify(Object.keys(metadata).length?metadata:part.input,null,2)?.slice(0,6000)}</pre></details>;
      }
      return null;
     })}</article>)}
     {busy&&<div className="chat-working"><Loader2 size={13} className="animate-spin"/>{agent.status==='submitted'?'Starting authoring session…':'Working…'}</div>}
     {errorMessage&&<p className="chat-error" role="alert">{errorMessage}</p>}
     <div ref={messagesEnd}/>
    </div>
    <form className="assistant-composer" onSubmit={e=>{e.preventDefault();void send();}}><Textarea aria-label="Message the authoring assistant" placeholder="Describe the spell or effect…" rows={3} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send();}}}/><div><Button type="button" variant="ghost" size="sm" disabled={busy} title="Ask the agent to inspect the current canvas" onClick={()=>void send('Capture and inspect the current canvas. Tell me what you see and suggest concrete improvements.')}><Camera size={14}/>Inspect canvas</Button>{busy?<Button type="button" size="icon" aria-label="Stop agent" onClick={()=>void agent.cancel().catch(e=>setLocalError(e.message))}><Square size={13}/></Button>:<Button type="submit" size="icon" aria-label="Send message" disabled={!input.trim()}><ArrowUp/></Button>}</div><small>Changes use the same editor tools. Shift ↵ for a new line.</small></form>
   </aside>
   <Dialog open={settingsOpen} onOpenChange={value=>{setSettingsOpen(value);if(!value)setKey('');}}><DialogContent className="studio-settings"><DialogHeader><DialogTitle>Settings</DialogTitle><DialogDescription>Connect OpenAI to author spells and generate artwork.</DialogDescription></DialogHeader><div className="settings-key-status"><KeyRound size={16}/><div><strong>{settings?.configured?'OpenAI connected':'OpenAI API key'}</strong><p>{settings?.available===false?'Your operating-system credential store is locked or unavailable.':'Stored securely in your operating-system credential store.'}</p></div>{settings?.configured&&<Check size={16}/>}</div><label>API key<Input type="password" autoComplete="off" spellCheck={false} placeholder={settings?.configured?'Enter a new key to replace the saved key':'sk-…'} value={key} onChange={e=>setKey(e.target.value)}/></label><p className="settings-note">The saved key is never returned to this browser, included in chat history, or written to your project.</p><label>Authoring model<select value={settings?.model??'gpt-6.1-sol'} onChange={e=>setSettings(s=>s?{...s,model:e.target.value}:s)}><option value="gpt-6.1-sol">GPT 6.1 Sol</option><option value="gpt-6-luna">GPT 6 Luna</option><option value="gpt-6-astra">GPT 6 Astra</option></select></label><label>Image generation<select value={settings?.imageModel??'gpt-image-2.5-sunburst'} onChange={e=>setSettings(s=>s?{...s,imageModel:e.target.value}:s)}><option value="gpt-image-2.5-sunburst">GPT Image 2.5 · Sunburst</option><option value="gpt-image-2.5-flare">GPT Image 2.5 · Flare</option></select></label><p className="settings-note">Images support transparent backgrounds. Generation is billed to your OpenAI account. Model changes start a fresh chat.</p>{settingsError&&<p className="chat-error" role="alert">{settingsError}</p>}<DialogFooter>{settings?.configured&&<Button variant="ghost" disabled={saving||busy} onClick={()=>void request('settings','DELETE').then(s=>{setSettings(s);setKey('');agent.reset();}).catch(e=>setSettingsError(e.message))}>Remove key</Button>}<Button variant="outline" onClick={()=>setSettingsOpen(false)}>Cancel</Button><Button disabled={saving||busy||!settings?.configured&&!key.trim()} onClick={()=>void save()}>{saving?<Loader2 className="animate-spin"/>:<Check/>}Save settings</Button></DialogFooter></DialogContent></Dialog>
  </>;
 }
 createRoot(host).render(<Assistant/>);
}
