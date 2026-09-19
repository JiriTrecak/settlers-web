import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import {parseUtcMap} from '../../src/shared/map/utcmap';
import {forestWarfareDressing} from '../../scripts/maps/forest-warfare-dressing';
const visit=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?visit(join(dir,e.name)):e.name.endsWith('.utcmap')?[join(dir,e.name)]:[]);
it.each(visit('assets/maps'))('%s preserves authored gameplay and can be dressed repeatedly',path=>{
 const source=parseUtcMap(JSON.parse(readFileSync(path,'utf8')))!;
 expect(source).toBeTruthy();const before=structuredClone(source),map=forestWarfareDressing(source);
 expect(source).toEqual(before);
 expect(forestWarfareDressing(map)).toEqual(map);
 expect(map.entities.map(({appearance,...gameplay})=>gameplay)).toEqual(source.entities.map(({appearance,...gameplay})=>gameplay));
 expect(map.mission).toEqual(source.mission);expect(map.height).toEqual(source.height);
 expect(map.playerStarts).toEqual(source.playerStarts);
 expect(map.stamps.map(({asset,scale,...placement})=>placement)).toEqual(source.stamps.map(({asset,scale,...placement})=>placement));
 for(const e of map.entities.filter(e=>e.definition==='resource.forest.tree'))expect(['asset.resource.tree-primary','asset.resource.tree-secondary']).toContain(e.appearance?.asset);
 for(const cover of map.landscape?.cover??[])expect(cover.palette).toBe('forest');
 if(map.landscape?.environment.interior)expect(map.landscape.environment).toEqual(source.landscape!.environment);
});
