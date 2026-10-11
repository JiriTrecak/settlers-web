import {afterEach,expect,it,vi} from 'vitest';
import {Object3D,PerspectiveCamera,Scene} from 'three';
import {MineLabels} from '../../src/render/settlement/mineLabels';
afterEach(()=>vi.unstubAllGlobals());
it('keeps native text fixed-size through zoom and buffer changes, hides unseen labels and removes stale nodes',()=>{
 const nodes:any[]=[];
 vi.stubGlobal('document',{createElement:()=>{
  const node={style:{},hidden:false,textContent:'',append:vi.fn(),remove:vi.fn()};nodes.push(node);return node;
 }});
 const labels=new MineLabels(),anchor=new Object3D(),scene=new Scene();scene.add(anchor);
 const camera=new PerspectiveCamera(50,16/9,.1,1000);camera.position.set(0,0,20);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 const canvas={width:1920,height:1080,isConnected:true,parentElement:{append:vi.fn()},getBoundingClientRect:()=>({left:25,top:10,width:960,height:540})} as unknown as HTMLCanvasElement;
 labels.update(anchor,5,10);labels.present(camera,canvas);
 const label=nodes[0];expect(label.textContent).toBe('Workers 5/10');expect(label.hidden).toBe(false);
 expect(label.style.transform).toBe('translate(480px,270px) translate(-50%,-100%)');
 const style=label.style.cssText;
 camera.position.z=100;camera.updateMatrixWorld();canvas.width=1280;canvas.height=720;labels.present(camera,canvas);
 expect(label.style.cssText).toBe(style);expect(label.style.transform).toBe('translate(480px,270px) translate(-50%,-100%)');
 scene.visible=false;labels.present(camera,canvas);expect(label.hidden).toBe(true);
 scene.visible=true;anchor.position.z=150;labels.present(camera,canvas);expect(label.hidden).toBe(true);
 anchor.position.z=0;labels.update(anchor,8,10);labels.present(camera,canvas);expect(label.textContent).toBe('Workers 8/10');expect(label.hidden).toBe(false);
 labels.remove(anchor);expect(label.remove).toHaveBeenCalledOnce();labels.dispose();expect(nodes[1].remove).toHaveBeenCalledOnce();
});
