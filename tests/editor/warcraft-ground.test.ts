import {expect,it} from 'vitest';
import {warcraftCornerGround} from '../../src/editor/import/warcraft/ground';
import type {WarcraftTerrain,WarcraftCorner} from '../../src/editor/import/warcraft/terrain';
const definitions={CLdi:{groundTile:'Ldrt'},CLgr:{groundTile:'Lgrs'}};
function terrain():WarcraftTerrain{
 const corner:WarcraftCorner={ground:0,waterHeight:0,water:false,ramp:false,blight:false,boundary:false,texture:0,variation:0,cliffTexture:1,cliffVariation:0,level:2};
 return {version:11,tileset:'L',groundTiles:['Ldrt','Lgrs'],cliffTiles:['CLdi','CLgr'],width:6,height:6,offsetX:0,offsetY:0,corners:Array.from({length:36},()=>({...corner}))};
}
it('uses the declared cliff ground around raised cells, retaining ordinary paint elsewhere',()=>{
 const t=terrain();t.corners[2*6+2].level=3;
 const before=structuredClone(t),resolved=warcraftCornerGround(t,definitions);
 for(let z=1;z<=3;z++)for(let x=1;x<=3;x++)expect(resolved[z*6+x],`${x},${z}`).toBe(1);
 expect(resolved[0]).toBe(0);expect(resolved[4*6+4]).toBe(0);expect(t).toEqual(before);
});
it('resolves the source default cliff index and the missing preferred-ground fallback',()=>{
 const t=terrain();t.corners[2*6+2].level=3;for(const c of t.corners)c.cliffTexture=15;
 expect(warcraftCornerGround(t,definitions)[2*6+2]).toBe(1);
 t.groundTiles=['Ldrt'];expect(warcraftCornerGround(t,definitions)[2*6+2]).toBe(0);
});
it('rejects unknown used cliff definitions without rejecting unused table entries',()=>{
 const t=terrain();t.cliffTiles[1]='????';expect(warcraftCornerGround(t,definitions)[0]).toBe(0);
 t.corners[2*6+2].level=3;expect(()=>warcraftCornerGround(t,definitions)).toThrow('Cliff texture ????');
});
