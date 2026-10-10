import {mkdtempSync,realpathSync,readFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,expect,it} from 'vitest';
import {readMapFile,writeMapFile} from '../../mcp/editor/mapFiles';
const roots:string[]=[];
const root=()=>{const value=realpathSync(mkdtempSync(join(tmpdir(),'utc-map-files-')));roots.push(value);return value;};
afterEach(()=>{for(const path of roots.splice(0))rmSync(path,{recursive:true,force:true});});
it('exports a full document to disk and returns only a small receipt',()=>{
 const directory=root(),map={v:3,name:'Large map',size:512,terrain:'a'.repeat(11*1024*1024)};
 const result=writeMapFile('tmp/export.utcmap',map,directory);
 expect(result.bytes).toBeGreaterThan(10*1024*1024);expect(JSON.stringify(result).length).toBeLessThan(300);expect(readMapFile(result.path)).toEqual(map);
});
it('does not overwrite an existing file or escape the project through traversal or symlinks',()=>{
 const directory=root(),outside=root(),map={name:'Original'},path=join(directory,'map.utcmap');
 writeMapFile(path,map,directory);expect(()=>writeMapFile(path,{name:'Replacement'},directory)).toThrow();expect(JSON.parse(readFileSync(path,'utf8'))).toEqual(map);
 expect(()=>writeMapFile('../escape.utcmap',map,directory)).toThrow('inside');
 symlinkSync(outside,join(directory,'link'));expect(()=>writeMapFile('link/new/map.utcmap',map,directory)).toThrow('outside');
 expect(()=>writeMapFile('source.ts',map,directory)).toThrow('utcmap');
});
