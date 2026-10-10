import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {readWarcraftMap} from '../../src/editor/import/warcraft/read';
import {convertWarcraftMap} from '../../src/editor/import/warcraft/convert';
import {readUtcMap,stringifyUtcMap} from '../../src/shared/map/utcmap';
import {HeightField,WADING_DEPTH_CM} from '../../src/shared/map/height';
import {restoreTerrain,decodeBytes,decodeFloats} from '../../src/shared/map/terrainData';
import {editTerrainGrid} from '../../src/shared/authoring/gridTerrain';
const load=(name:string)=>readWarcraftMap(new Uint8Array(readFileSync(`tests/editor/fixtures/warcraft/${name}.w3x`)));

it.each([
 ['echo-isles',2060,2,5,{small:8,medium:11,hard:0}],
 ['turtle-rock',1671,4,10,{small:4,medium:16,hard:2}],
] as const)('converts %s into editable values and substitutes camps by source level', (name,trees,starts,mines,tiers)=>{
 const source=load(name),{map,report}=convertWarcraftMap(source);
 expect(report).toMatchObject({trees,starts,mines,campCounts:tiers,warnings:[]});
 expect(map.authoring!.objects).toHaveLength(trees);expect(map.playerStarts).toHaveLength(starts);
 expect(map.entities.filter(e=>e.definition==='building.neutral.amber-mine')).toHaveLength(mines*4);
 const sourceTree=source.doodads.find(d=>d.id==='LTlt')!,tree=map.authoring!.objects.find(o=>o.id===`warcraft.tree.${source.doodads.indexOf(sourceTree)}`)!;
 expect(tree.x).toBe((sourceTree.location[0]-source.terrain.offsetX)/32-.5);
 expect(tree.z).toBe(512-(sourceTree.location[1]-source.terrain.offsetY)/32-.5);
 expect(map.entities.filter(e=>e.definition.startsWith('unit.neutral.')).length).toBe(map.camps.reduce((n,c)=>n+c.members.length,0));
 expect(report.camps.every(c=>c.difficulty===(c.sourceLevel<10?'small':c.sourceLevel<20?'medium':'hard'))).toBe(true);
 const json=stringifyUtcMap(map),loaded=readUtcMap(JSON.parse(json));expect('map'in loaded).toBe(true);
 expect(json).not.toMatch(/"layers"|"generators"|"importedTerrain"|"layerSlots"|"connections"/);
 const field=new HeightField(map.size);restoreTerrain(field,map.authoring!.terrain!);
 let shallow=0,deep=0;
 for(let i=0;i<field.samples.length;i++){const depth=field.cellWater!.heights[i]-field.samples[i];if(depth>.01&&depth<=WADING_DEPTH_CM/100+.00001)shallow++;else if(depth>WADING_DEPTH_CM/100)deep++;}
 expect(shallow).toBeGreaterThan(100);expect(deep).toBeGreaterThan(100);
 const cliffPaint=map.authoring.terrain.paint.filter(p=>p.material.includes('warcraft-cliff-'));
 expect(cliffPaint.length).toBeGreaterThan(0);for(const p of cliffPaint)expect(decodeFloats(p.weights).some(w=>w>0)).toBe(true);
 expect(report.textures.some(t=>t.source.startsWith('CL')&&t.asset.includes('warcraft-cliff-'))).toBe(true);
 const saved=map.authoring!.terrain!,variant=saved.paint[0].variants!;expect(new Set(decodeBytes(variant)).size).toBeGreaterThan(3);
 const edited=editTerrainGrid(saved,{selection:{type:'rectangle',from:{x:20,z:20},to:{x:21,z:21}},operation:{type:'dry',level:2}}).terrain;
 expect(edited.paint[0].variants).toBe(variant);expect(edited.heights).not.toBe(saved.heights);
},20000);

it('fails clearly when a source material has no declared asset',()=>{
 const input=load('echo-isles');input.terrain.groundTiles[0]='????';
 expect(()=>convertWarcraftMap(input)).toThrow(/Ground texture/);
});

it('checks MPQ table bounds before decoding entries',()=>{
 const bytes=new Uint8Array(readFileSync('tests/editor/fixtures/warcraft/echo-isles.w3x'));
 const v=new DataView(bytes.buffer);v.setUint32(512+24,0x7fffffff,true);
 expect(()=>readWarcraftMap(bytes)).toThrow(/MPQ table/);
});

it('honors custom tree ancestry and source unit level overrides',()=>{
 const input=load('echo-isles'),tree=input.doodads.find(d=>d.id==='LTlt')!;
 tree.id='T001';input.treeChanges.push({base:'LTlt',id:'T001',fields:{}});
 input.unitChanges.push({base:'nmrm',id:'nmrm',fields:{ulev:20}});
 const imported=convertWarcraftMap(input);
 expect(imported.report.trees).toBe(2060);
 expect(imported.report.camps.filter(c=>c.sourceMembers.includes('nmrm')).every(c=>c.difficulty==='hard')).toBe(true);
});

it('fits the complete supported elevation span without clipping the source shape',()=>{
 const input=load('echo-isles');
 for(const corner of input.terrain.corners){corner.ground=0;corner.level=2;corner.water=false;corner.ramp=false;}
 input.terrain.corners[0].ground=10; // 40 world units above the remaining terrain.
 const {map}=convertWarcraftMap(input),field=new HeightField(map.size);restoreTerrain(field,map.authoring.terrain);
 let min=Infinity,max=-Infinity;for(const h of field.samples){min=Math.min(min,h);max=Math.max(max,h);}
 expect(min).toBe(-16);expect(max).toBe(24);
 expect('map' in readUtcMap(JSON.parse(stringifyUtcMap(map)))).toBe(true);
 input.terrain.corners[0].ground=10.5;
 expect(()=>convertWarcraftMap(input)).toThrow('supported elevation span');
},20000);
