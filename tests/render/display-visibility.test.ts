import {afterEach,expect,it,vi} from 'vitest';
import {Scene,PerspectiveCamera} from 'three';
import {Display} from '../../src/render/display/display';

afterEach(()=>vi.unstubAllGlobals());
it.each([{hidden:true,width:1280,height:720},{hidden:false,width:0,height:720},{hidden:false,width:1280,height:0}])('skips GPU and portrait work for a hidden or collapsed viewport: %o',({hidden,width,height})=>{
 vi.stubGlobal('document',{hidden});
 const begin=vi.fn(),after=vi.fn();
 const display={canvas:{clientWidth:width,clientHeight:height},gpu:{begin}} as unknown as Display;
 // Intentionally no WebGL context: an invisible view must not touch GPU state.
 Display.prototype.render.call(display,new Scene(),new PerspectiveCamera(),after);
 expect(begin).not.toHaveBeenCalled();expect(after).not.toHaveBeenCalled();
});
