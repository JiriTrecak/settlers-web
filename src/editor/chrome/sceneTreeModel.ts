import type {AuthoringScene} from '../../shared/authoring/layers';
import type {LandscapeAsset} from '../../shared/authoring/catalogue';
import {generationStage} from '../../shared/authoring/recipes';
import type {UtcMap} from '../../shared/map/utcmap';

export type SceneTreeSelection={kind:'layer'|'object'|'stamp'|'entity';id:string};
export type SceneTreeNode={id:string;name:string;detail:string;icon:'folder'|'layers'|'tree'|'water'|'terrain'|'path'|'object'|'entity';parent:string;children:string[];folder:boolean;locked?:boolean;hidden?:boolean;selection?:SceneTreeSelection};
export type SceneTreeModel={nodes:Map<string,SceneTreeNode>;count:number};
export type SceneTreeInput={scene:AuthoringScene;assets:readonly LandscapeAsset[];generated:readonly {owner:string}[];stamps:UtcMap['stamps'];entities:UtcMap['entities']};

/** Presentation-only grouping: never reorder generation or write folders into a map. */
export function buildSceneTree(input:SceneTreeInput):SceneTreeModel{
 const nodes=new Map<string,SceneTreeNode>(),assets=new Map(input.assets.map(a=>[a.id,a])),counts=new Map<string,number>();
 for(const o of input.generated)counts.set(o.owner,(counts.get(o.owner)??0)+1);
 const add=(node:SceneTreeNode)=>{nodes.set(node.id,node);nodes.get(node.parent)?.children.push(node.id);return node;};
 const group=(id:string,name:string,parent:string,icon:SceneTreeNode['icon']='folder')=>nodes.get(id)??add({id,name,parent,icon,detail:'',folder:true,children:[]});
 group('root','Scene','');group('layers','Layers','root','layers');group('objects','Objects','root','object');group('stamps','Placed scenery','root','tree');group('entities','Gameplay','root','entity');
 const kinds={terrain:['Terrain','terrain'],river:['Water','water'],path:['Paths & ground','path'],forest:['Forests','tree'],grass:['Grass & meadows','tree'],meadow:['Grass & meadows','tree'],'ground-cover':['Ground cover','tree']} as const;
 const layers=[...input.scene.layers].sort((a,b)=>(generationStage[assets.get(a.recipe)?.recipe?.type??'ground-cover']-generationStage[assets.get(b.recipe)?.recipe?.type??'ground-cover'])||a.order-b.order);
 for(const l of layers){
  const type=assets.get(l.recipe)?.recipe?.type??'ground-cover',[name,icon]=kinds[type],parent=group(`layers:${name}`,name,'layers',icon).id,count=counts.get(l.id)??0;
  add({id:`layer:${l.id}`,name:l.name,detail:!l.enabled?'Disabled':count?count.toLocaleString():'',icon,parent,folder:false,children:[],locked:l.locked,hidden:!l.visible,selection:{kind:'layer',id:l.id}});
 }
 const object=(kind:SceneTreeSelection['kind'],id:string,asset:string,parent:string,locked=false,hidden=false)=>{
  const name=assets.get(asset)?.name??asset.replace(/^asset\.models\./,'').replaceAll('.',' · ');
  const folder=group(`${parent}:${asset}`,name,parent).id;
  add({id:`${kind}:${id}`,name,detail:id,icon:kind==='entity'?'entity':'object',parent:folder,folder:false,children:[],locked,hidden,selection:{kind,id}});
 };
 for(const o of input.scene.objects)object('object',o.id,o.asset,'objects',o.locked,!o.visible);
 for(const s of input.stamps)object('stamp',s.id,s.asset,'stamps');
 for(const e of input.entities)object('entity',e.id,e.definition,'entities');
 const count=(id:string):number=>{const n=nodes.get(id)!;if(!n.folder)return 1;const total=n.children.reduce((sum,child)=>sum+count(child),0);n.detail=String(total);return total;};
 return {nodes,count:count('root')};
}

export function filterSceneTree(model:SceneTreeModel,query:string,filter:'all'|'layers'|'objects'):SceneTreeModel{
 const q=query.trim().toLowerCase(),nodes=new Map<string,SceneTreeNode>();let count=0;
 const walk=(id:string,matchedParent=false):boolean=>{
  const n=model.nodes.get(id)!;
  if((filter==='layers'&&['objects','stamps','entities'].includes(id))||(filter==='objects'&&id==='layers'))return false;
  const matches=matchedParent||!q||`${n.name} ${n.id} ${n.detail}`.toLowerCase().includes(q);
  const children=n.children.filter(child=>walk(child,id==='root'?false:matches));
  if(id!=='root'&&!children.length&&(n.folder||!matches))return false;
  if(!n.folder)count++;
  nodes.set(id,{...n,children});return true;
 };
 walk('root');return {nodes,count};
}
