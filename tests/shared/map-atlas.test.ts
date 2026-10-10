import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {atlasSymbols} from '../../scripts/maps/atlas';
import {emptyUtcMap,parseUtcMap} from '../../src/shared/map/utcmap';

const mine=(id:string,x:number,y:number)=>({id,definition:'building.neutral.amber-mine',owner:'none' as const,rotation:0,position:{x,y}});
const icons=(svg:string)=>(svg.match(/<circle r="8"/g)??[]).length;

it('labels actual player numbers at scaled x/z start positions',()=>{
 const base=emptyUtcMap();
 const map={...base,playerStarts:[{...base.playerStarts[0]!,player:8,x:80,z:120},{...base.playerStarts[0]!,player:3,x:160,z:240}]};
 const svg=atlasSymbols(map,map.size/2);
 expect(svg).toContain('translate(40 60)');expect(svg).toContain('>P8</text>');
 expect(svg).toContain('translate(80 120)');expect(svg).toContain('>P3</text>');
 expect(svg).not.toContain('>P1</text>');
 expect((svg.match(/<text /g)??[])).toHaveLength(2);
 expect(svg).toContain('<text y="-20"');
});

it('shows one centered symbol for neighboring mine nodes, keeping separate deposits distinct',()=>{
 const map={...emptyUtcMap(),entities:[mine('a',40,40),mine('b',48,40),mine('c',56,40),mine('isolated',100,100)]};
 const svg=atlasSymbols(map,map.size);
 expect(icons(svg)).toBe(2);expect(svg).toContain('translate(48 40)');expect(svg).toContain('translate(100 100)');
 expect(atlasSymbols({...map,entities:[...map.entities].reverse()},map.size)).toBe(svg);
 expect(icons(atlasSymbols(map,map.size/2))).toBe(2);
});
it('renders the imported Echo Isles mine sites once each instead of overlapping node icons',()=>{
 const map=parseUtcMap(JSON.parse(readFileSync('assets/maps/skirmish/echo-isles.utcmap','utf8')))!;
 expect(map.entities.filter(e=>e.definition==='building.neutral.amber-mine')).toHaveLength(20);
 const svg=atlasSymbols(map);expect(icons(svg)).toBe(5);
 expect((svg.match(/stroke-linejoin="round"/g)??[])).toHaveLength(map.camps.length);
});
