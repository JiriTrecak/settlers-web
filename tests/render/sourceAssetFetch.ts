/** Node-side texture IO for renderer tests; reads the same compressed assets as Vite. */
import {beforeAll,afterAll,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
beforeAll(()=>vi.stubGlobal('fetch',async(url:string|URL|Request)=>{
 const path=typeof url==='string'?url:url instanceof URL?url.pathname:url.url;
 if(!path.startsWith('/assets/library/'))throw Error('Unexpected renderer test URL: '+path);
 const root=resolve('assets/library'),file=resolve('.'+path);
 if(!file.startsWith(root+'/'))throw Error('Invalid asset path');
 return new Response(await readFile(file));
}));
afterAll(()=>vi.unstubAllGlobals());
