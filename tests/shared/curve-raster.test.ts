import {it,expect} from 'vitest';
import {curveDistance,rasterizeCurve,sampleCurve} from '../../src/shared/landscape/curve';
it('bounded stroke rasterization matches full distance evaluation including varying radii',()=>{
 const curve=sampleCurve([{x:2,z:5,radius:2},{x:15,z:19,radius:5},{x:28,z:8,radius:1}],3);
 const raster=rasterizeCurve(curve,40,-4);
 for(let z=0;z<40;z++)for(let x=0;x<40;x++)expect(raster[z*40+x]).toBeCloseTo(Math.min(1,curveDistance(x-4,z-4,curve)),5);
});
