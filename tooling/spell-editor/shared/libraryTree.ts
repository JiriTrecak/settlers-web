import {z} from 'zod';
export const libraryKindSchema=z.enum(['spells','effects']);
export type LibraryKind=z.infer<typeof libraryKindSchema>;
const nodeId=z.string().regex(/^[a-z][a-z0-9.-]*$/).max(160);
const folderName=z.string().trim().min(1).max(80).refine(n=>!/[\\/]/.test(n)&&n!=='.'&&n!=='..','Folder names cannot contain slashes');
export const libraryTreeSchema=z.object({schemaVersion:z.literal(1),folders:z.array(z.object({id:nodeId,name:folderName,parent:nodeId}).strict()).max(10000),items:z.record(nodeId,nodeId)}).strict();
export type LibraryTree=z.infer<typeof libraryTreeSchema>;
export const treeActionSchema=z.discriminatedUnion('type',[
 z.object({type:z.literal('create'),parent:nodeId,name:folderName}).strict(),
 z.object({type:z.literal('rename'),id:nodeId,name:folderName}).strict(),
 z.object({type:z.literal('move'),ids:z.array(nodeId).min(1).max(10000),parent:nodeId}).strict(),
 z.object({type:z.literal('remove'),id:nodeId}).strict(),
]);
export function validateTree(tree:LibraryTree){
 const ids=new Set(['root']);for(const f of tree.folders){if(ids.has(f.id))throw Error('Duplicate folder ID');ids.add(f.id);}
 const byId=new Map(tree.folders.map(f=>[f.id,f]));
 const siblings=new Set<string>();for(const f of tree.folders){if(!ids.has(f.parent))throw Error('Missing parent folder');const key=f.parent+'/'+f.name.toLowerCase();if(siblings.has(key))throw Error('A folder with that name already exists here');siblings.add(key);const seen=new Set([f.id]);let parent=f.parent;while(parent!=='root'){if(seen.has(parent))throw Error('Cannot move a folder into itself or its descendants');seen.add(parent);parent=byId.get(parent)!.parent;}}
 for(const parent of Object.values(tree.items))if(!ids.has(parent))throw Error('Missing item folder');return tree;
}
