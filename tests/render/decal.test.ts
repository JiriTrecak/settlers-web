import { describe, expect, it } from 'vitest';
import { HeightField, emptyUtcMap, parseUtcMap, stringifyUtcMap, HEIGHT_ORIGIN, HEIGHT_VERTS } from '../../src/shared';
import { decalAt, type GroundDecal } from '../../src/shared/landscape/decal';
import { decalGeometry } from '../../src/render/decal/decalLayer';
const decal:GroundDecal={id:'leaf-1',kind:'leaf-litter',x:10.3,z:12.8,size:5,rotation:37,opacity:.8};
describe('ground decals',()=>{
  it('roundtrips independently of objects and rejects malformed or duplicate decals',()=>{
    const map={...emptyUtcMap(),landscape:{strokes:[],cover:[],environment:{hour:10,season:'summer' as const,playing:false},decals:[decal]}};
    expect(parseUtcMap(JSON.parse(stringifyUtcMap(map)))?.landscape?.decals).toEqual([decal]);
    for(const bad of [{...decal,size:0},{...decal,opacity:2},{...decal,x:NaN},{...decal,kind:'unknown'}])expect(parseUtcMap({...map,landscape:{...map.landscape,decals:[bad]}})).toBeNull();
    expect(parseUtcMap({...map,landscape:{...map.landscape,decals:[decal,decal]}})).toBeNull();
    expect(parseUtcMap(emptyUtcMap())).not.toBeNull();
  });
  it('picks the uppermost overlapping rotated patch without selecting an outside point',()=>{
    expect(decalAt([decal,{...decal,id:'top'}],decal.x,decal.z)?.id).toBe('top');
    expect(decalAt([decal],decal.x+5,decal.z)).toBeUndefined();
  });
  it('matches terrain vertices and diagonal before and after a height edit',()=>{
    const field=new HeightField();
    for(let z=0;z<HEIGHT_VERTS;z++)for(let x=0;x<HEIGHT_VERTS;x++)field.samples[z*HEIGHT_VERTS+x]=Math.sin(x*.6)*Math.cos(z*.5)*3;
    for(let pass=0;pass<2;pass++){
      const geo=decalGeometry(decal,field),p=geo.getAttribute('position'),uv=geo.getAttribute('uv');
      for(let i=0;i<p.count;i++){
        const x=p.getX(i),z=p.getZ(i);expect(x).toBe(Math.round(x));expect(z).toBe(Math.round(z));
        expect(p.getY(i)).toBeCloseTo(field.samples[(z-HEIGHT_ORIGIN)*HEIGHT_VERTS+x-HEIGHT_ORIGIN]!+.012,5);
        expect(Number.isFinite(uv.getX(i))).toBe(true);
      }
      const ids=Array.from(geo.index!.array);expect(ids.slice(0,6)).toEqual([0,Math.round(p.getX(p.count-1)-p.getX(0))+1,1,1,Math.round(p.getX(p.count-1)-p.getX(0))+1,Math.round(p.getX(p.count-1)-p.getX(0))+2]);
      geo.dispose();field.samples.forEach((v,i)=>field.samples[i]=v+2);
    }
  });
});
