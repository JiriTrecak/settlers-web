import type {ContentRegistry} from '../../content/registry';
import {globalShortcuts,authoredKey,type Shortcut} from './shortcuts';
export function shortcutCatalog(c:ContentRegistry):Shortcut[]{
 const entries=new Map<string,Shortcut>();
 const add=(id:string,name:string,key?:string)=>entries.set(id,{id:`command.${id}`,name,key:authoredKey(key),scope:'command'});
 for(const[id,a]of Object.entries(c.actions.actions))if(!["build","produce","research","cancelResearch"].includes(id))add(id,a.name,a.hotkey);
 for(const[id,a]of Object.entries(c.actions.categories))add(`category:${id}`,a.name,a.hotkey);
 add('navigation:back',c.actions.navigation.back.name,c.actions.navigation.back.hotkey);
 for(const[id,a]of Object.entries(c.actions.overrides)){if(a.hidden)continue;const [verb,...parts]=id.split(':');const d=c.definitions.find(d=>d.id===parts.join(':'));add(id,d?.name??id,a.hotkey??c.actions.actions[verb as keyof typeof c.actions.actions]?.hotkey);}
 for(const d of c.definitions){if(d.creation && ['construct','recruit'].includes(d.creation.method)){const verb=d.creation.method==='construct'?'build':'produce',id=`${verb}:${d.id}`;if(!entries.has(id)&&!c.actions.overrides[id]?.hidden)add(id,d.name,c.actions.actions[verb].hotkey);}}
 for(const[id,a]of Object.entries(c.rules.spells)){add(`cast:${id}`,a.name,a.hotkey);add(`learn:${id}`,`Learn ${a.name}`,a.hotkey);}
 for(const[id,a]of Object.entries(c.rules.research))add(`research:${id}`,a.name);
 return [...globalShortcuts,...entries.values()];
}
