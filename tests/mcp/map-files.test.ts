import {mkdtempSync,realpathSync,readFileSync,rmSync,symlinkSync,readdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,expect,it} from 'vitest';
import {readMapFile,writeMapFile,mapFileInfo} from '../../mcp/editor/mapFiles';
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

it('replaces only the explicitly inspected revision without leaving extra map files',()=>{
 const directory=root(),path='map.utcmap';
 writeMapFile(path,{name:'Original',size:512},directory);
 const before=mapFileInfo(path,directory);
 expect(before.name).toBe('Original');expect(before.sha256).toMatch(/^[a-f0-9]{64}$/);
 const saved=writeMapFile(path,{name:'Rescaled',size:640},directory,before.sha256);
 expect(saved.sha256).not.toBe(before.sha256);
 expect(readMapFile(saved.path)).toEqual({name:'Rescaled',size:640});
 expect(readdirSync(directory)).toEqual(['map.utcmap']);
 expect(()=>writeMapFile(path,{name:'Stale'},directory,before.sha256)).toThrow('changed since inspection');
 expect(mapFileInfo(path,directory).sha256).toBe(saved.sha256);
});
it('refuses stale, missing and symlink replacement targets',()=>{
 const directory=root(),path='map.utcmap';
 const initial=writeMapFile(path,{name:'Original'},directory);
 writeFileSync(initial.path,JSON.stringify({name:'Other editor'}));
 expect(()=>writeMapFile(path,{name:'Lost edit'},directory,initial.sha256)).toThrow('changed since inspection');
 expect(readMapFile(initial.path)).toEqual({name:'Other editor'});
 expect(()=>writeMapFile('missing.utcmap',{},directory,initial.sha256)).toThrow();
 symlinkSync(initial.path,join(directory,'alias.utcmap'));
 expect(()=>mapFileInfo('alias.utcmap',directory)).toThrow('symbolic link');
 expect(()=>writeMapFile('alias.utcmap',{},directory,initial.sha256)).toThrow('symbolic link');
 expect(readdirSync(directory).sort()).toEqual(['alias.utcmap','map.utcmap']);
});
