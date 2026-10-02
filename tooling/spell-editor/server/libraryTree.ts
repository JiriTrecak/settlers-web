import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {canonical} from '../../../src/content/registry';
import {libraryTreeSchema,validateTree,type LibraryKind,type treeActionSchema} from '../shared/libraryTree';
import type {z} from 'zod';
import {commitFiles} from '../../asset-studio/server/transaction';
const file=(kind:LibraryKind)=>`content/${kind==='spells'?'abilities':'effects'}/folders.json`;
const hash=(v:unknown)=>createHash('sha256').update(canonical(v)).digest('hex');
export async function readLibraryTree(root:string,kind:LibraryKind){let tree;try{tree=validateTree(libraryTreeSchema.parse(JSON.parse(await readFile(path.join(root,file(kind)),'utf8'))));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;tree=libraryTreeSchema.parse({schemaVersion:1,folders:[],items:{}});}return {tree,revision:hash(tree)};}
export async function mutateLibraryTree(root:string,kind:LibraryKind,action:z.infer<typeof treeActionSchema>,revision:string,documents:string[]){
 const current=await readLibraryTree(root,kind);if(current.revision!==revision)throw Error('Folder revision conflict: reload the library');const tree=structuredClone(current.tree);const isFolder=(id:string)=>id==='root'||tree.folders.some(f=>f.id===id);
 if('parent'in action&&!isFolder(action.parent))throw Error('Unknown destination folder');
 if(action.type==='create')tree.folders.push({id:'folder.'+randomUUID(),name:action.name,parent:action.parent});
 if(action.type==='rename'){const folder=tree.folders.find(f=>f.id===action.id);if(!folder)throw Error('Select a folder to rename');folder.name=action.name;}
 if(action.type==='move'){if(action.ids.includes('root'))throw Error('Root cannot be moved');for(const id of action.ids){const folder=tree.folders.find(f=>f.id===id);if(folder)folder.parent=action.parent;else{if(!documents.includes(id))throw Error('Unknown document '+id);tree.items[id]=action.parent;}}}
 if(action.type==='remove'){if(!tree.folders.some(f=>f.id===action.id))throw Error('Select a folder to remove');if(tree.folders.some(f=>f.parent===action.id)||Object.entries(tree.items).some(([id,parent])=>documents.includes(id)&&parent===action.id))throw Error('Move the contents out before removing this folder');tree.folders=tree.folders.filter(f=>f.id!==action.id);}
 validateTree(tree);await commitFiles(root,[{path:file(kind),bytes:Buffer.from(JSON.stringify(tree,null,2)+'\n')}]);return {tree,revision:hash(tree)};
}
