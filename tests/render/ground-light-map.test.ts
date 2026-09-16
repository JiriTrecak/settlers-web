import {it,expect} from 'vitest';
import {bakeGroundLights} from '../../src/render/terrain/groundLightMap';
it('bakes warm lamp bounce without overwriting contact shadows and clears removed lamps',()=>{
 const data=new Uint8Array(32*32*4);data[0]=90;
 const lamp={x:8,y:4,z:16,color:'#ffb347',intensity:24,range:14};
 bakeGroundLights(data,32,0,32,()=>0,[lamp]);
 const i=(16*32+8)*4;expect(data[i+1]).toBeGreaterThan(data[i+2]);expect(data[i+2]).toBeGreaterThan(data[i+3]);expect(data[0]).toBe(90);
 expect(data[(16*32+30)*4+1]).toBe(0);
 bakeGroundLights(data,32,0,32,()=>0,[]);expect(data.filter((_,i)=>i%4!==0).every(v=>v===0)).toBe(true);expect(data[0]).toBe(90);
});
it('blocks diffuse spill through a tall chamber wall',()=>{
 const clear=new Uint8Array(32*32*4),walled=new Uint8Array(clear.length),lamp={x:8,y:4,z:16,color:'#ffb347',intensity:100,range:14};
 bakeGroundLights(clear,32,0,32,()=>0,[lamp]);
 bakeGroundLights(walled,32,0,32,x=>x>10&&x<13?12:0,[lamp]);
 const beyond=(16*32+15)*4+1;expect(clear[beyond]).toBeGreaterThan(0);expect(walled[beyond]).toBe(0);
});
