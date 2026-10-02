import type {Plugin} from 'vite';
import {tsImport} from 'tsx/esm/api';
import path from 'node:path';
/** Keep runtime content imports outside Vite's config dependency graph. Publishing an
 * image/spell must hot-reload the canvas, not restart the server and kill the agent. */
export function spellEditor(root:string):Plugin{
 return {name:'spell-editor-service',async configureServer(server){
  const runtime=await tsImport(path.join(root,'tooling/spell-editor/server/http.ts'),import.meta.url);
  return runtime.spellEditor(root).configureServer(server);
 }};
}
