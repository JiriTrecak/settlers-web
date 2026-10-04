import type {SpellCommand} from '../shared/protocol';
import type {PreviewState} from '../shared/view';
import type {LibraryTree} from '../shared/libraryTree';
type Options={response:'compact'|'full';query?:string;offset:number;limit:number};
/** Transport-neutral, explicit summaries. Full editor responses remain available on demand. */
export function authoringResponse(command:SpellCommand,result:unknown,options:Options):unknown{
 if(options.response==='full')return result;
 const page=(items:unknown[])=>{const words=(options.query??'').toLowerCase().split(/\s+/).filter(Boolean),filtered=items.filter(item=>words.every(word=>JSON.stringify(item).toLowerCase().includes(word)));
  return {items:filtered.slice(options.offset,options.offset+options.limit),total:filtered.length,offset:options.offset,limit:options.limit,hasMore:options.offset+options.limit<filtered.length};};
 const preview=(state:PreviewState)=>{
  if(!state?.loaded)return state;
  const {document,effects,timelineEvents,events,deliveryHistory,...rest}=state;
  return {...rest,documentId:document.definition.id,effectIds:effects?.map(e=>e.id),events:events.slice(-32),eventCount:events.length,summary:true,omitted:['document','effects','timelineEvents','deliveryHistory',...(events.length>32?['earlierEvents']:[])],fullResponse:'Repeat the command with response: full for complete data.'};
 };
 if(command.op.startsWith('preview.')){const value=result as PreviewState|{state:PreviewState};return value&&'state'in value?{...value,state:preview(value.state)}:preview(value as PreviewState);}
 if(command.op.startsWith('effects.preview.')){const value=result as {document?:{id:string}}|null;if(!value?.document)return value;const {document,...rest}=value;return {...rest,documentId:document.id,summary:true};}
 if(command.op==='save'||command.op==='effects.save'){const value=result as {document:{definition?:{id:string};id?:string};revision:string};return {saved:true,id:value.document.definition?.id??value.document.id,revision:value.revision};}
 if(command.op==='list'||command.op==='effects.list')return page(result as unknown[]);
 if(command.op==='catalog')return Object.fromEntries(Object.entries(result as Record<string,unknown[]>).map(([key,items])=>[key,page(items)]));
 if(command.op==='tree.read'||command.op==='tree.mutate'){
  const {tree,revision}=result as {tree:LibraryTree;revision:string};
  if(command.op==='tree.mutate'){const action=command.action;return {changed:true,revision,...(action.type==='create'?{folder:tree.folders.find(f=>f.name===action.name&&f.parent===action.parent)}:{})};}
  const byId=new Map(tree.folders.map(f=>[f.id,f]));
  const folderPath=(id:string):string=>{const f=byId.get(id);return f?folderPath(f.parent)+'/'+f.name:'';};
  return {revision,root:'root',folders:page(tree.folders.map(f=>({...f,path:folderPath(f.id)}))),items:page(Object.entries(tree.items).map(([id,parent])=>({id,parent,path:folderPath(parent)})))};
 }
 return result;
}
