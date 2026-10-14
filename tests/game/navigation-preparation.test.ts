import {expect,it,vi} from 'vitest';
import {GroundMeshBuilder} from '../../src/shared/navigation/groundMesh';
import {game,placed} from './helpers';

it('prepares existing ground body sizes before their first long route',()=>{
 const g=game([placed('worker','unit.ants.settler',100,100)]);
 const actor=g.entities.find(e=>e.definition==='unit.ants.settler')!;
 expect(g.spatial.dimensions(actor).radius).not.toBe(g.spatial.unitRadius/1000);
 const build=vi.spyOn(GroundMeshBuilder.prototype,'build');
 try{
  const path=g.spatial.findPath(g.spatial.cell(actor),g.spatial.cell({x:180,y:100}),undefined,Infinity,actor);
  expect(path).not.toBeNull();expect(build).not.toHaveBeenCalled();
 }finally{build.mockRestore();}
});
