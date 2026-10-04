import {afterEach,expect,it,vi} from 'vitest';
import {ShapeOverlay} from '../../src/editor/chrome/shapeOverlay';
import type {WorldEditor} from '../../src/editor/world/worldEditor';

class Element extends EventTarget{
 children:Element[]=[];style:Record<string,string>={};attrs:Record<string,string>={};id='';
 constructor(readonly tag:string){super();}
 append(...children:Element[]){this.children.push(...children);}
 replaceChildren(...children:Element[]){this.children=children;}
 setAttribute(name:string,value:string){this.attrs[name]=value;}
 remove(){}
}
function setup(){
 let next:FrameRequestCallback=()=>{};
 vi.stubGlobal('document',{createElementNS:(_:string,tag:string)=>new Element(tag)});
 vi.stubGlobal('requestAnimationFrame',(fn:FrameRequestCallback)=>{next=fn;return 1;});vi.stubGlobal('cancelAnimationFrame',vi.fn());
 const rect={left:100,top:50},host=Object.assign(new Element('host'),{clientWidth:800,clientHeight:600,getBoundingClientRect:()=>rect});
 const layer={id:'paint',locked:false,shape:{type:'mask' as const,strokes:[{operation:'add',radius:5,points:Array.from({length:1000},(_,i)=>({x:i,z:i*2}))},{operation:'subtract',radius:2,points:[{x:10,z:10}]}]}};
 const view={x:0,z:0,gameCam:false,zoom:1,gameZoom:1,yaw:0,pitch:Math.PI/2};
 const editor={view:()=>view,layers:{revision:0,selection:{kind:'layer',id:'paint'},scene:{layers:[layer]}},shapeTerrain:{},paintPreview:layer,paintPreviewRevision:0,isPaintingLayer:true,layerCursor:{x:5,z:6},layerBrushSize:16,layerBrushOperation:'add',shapeScreenPoint:vi.fn((x:number,z:number)=>({x:100+(x-view.x)*view.zoom,y:50+(z-view.z)*view.zoom}))};
 const projection=vi.fn(()=>editor.shapeScreenPoint);Object.assign(editor,{shapeScreenProjector:projection});
 const overlay=new ShapeOverlay(host as unknown as HTMLElement,editor as unknown as WorldEditor,vi.fn());
 const frame=()=>next(0),svg=host.children[0]!,geometry=svg.children[0]!,cursor=svg.children[1]!;
 const mask=()=>geometry.children[0]!.children[0]!;
 return {editor,overlay,frame,geometry,cursor,mask,view,host,rect,projection};
}
afterEach(()=>vi.unstubAllGlobals());

it('hovers over a large painted mask without reprojecting or replacing its strokes',()=>{
 const {editor,overlay,frame,geometry,cursor,mask}=setup();frame();
 const firstMask=mask(),firstStroke=firstMask.children[0],geometryNodes=[...geometry.children];editor.shapeScreenPoint.mockClear();
 for(let i=0;i<60;i++){editor.layerCursor={x:i,z:i+1};frame();}
 expect(editor.shapeScreenPoint).toHaveBeenCalledTimes(120); // Two projections for the cursor, regardless of history size.
 expect(mask()).toBe(firstMask);expect(mask().children[0]).toBe(firstStroke);expect(geometry.children).toEqual(geometryNodes);
 expect(cursor.attrs.cx).toBe('59');expect(cursor.attrs.cy).toBe('60');
 editor.shapeScreenPoint.mockClear();for(let i=0;i<60;i++)frame();expect(editor.shapeScreenPoint).not.toHaveBeenCalled();
 overlay.destroy();
});
it('appends only new projected points, preserving subtraction order and single-point dots',()=>{
 const {editor,overlay,frame,mask}=setup();frame();const strokes=[...mask().children];editor.shapeScreenPoint.mockClear();
 editor.paintPreview.shape.strokes[1]!.points.push({x:12,z:13});editor.paintPreviewRevision++;frame();
 expect(editor.shapeScreenPoint).toHaveBeenCalledTimes(3);expect(mask().children).toEqual(strokes);
 expect(strokes.map(s=>s.attrs.stroke)).toEqual(['white','black']);expect(strokes[1]!.attrs.points).toBe('10,10 12,13');
 editor.paintPreview.shape.strokes.push({operation:'add',radius:3,points:[{x:20,z:21}]});editor.paintPreviewRevision++;frame();
 expect(mask().children.map(s=>s.attrs.stroke)).toEqual(['white','black','white']);expect(mask().children[2]!.attrs.points).toBe('20,21 20.01,21');
 overlay.destroy();
});
it('retains world strokes during camera/viewport/terrain changes and discards them on undo',()=>{
 const {editor,overlay,frame,geometry,mask,view,host,rect,cursor}=setup();frame();const previous=mask(),stroke=mask().children[1];
 editor.shapeScreenPoint.mockClear();
 view.zoom=2;frame();expect(mask()).toBe(previous);expect(stroke.attrs['stroke-width']).toBe('4');
 expect(geometry.attrs.transform).toBe('matrix(2 0 0 2 0 0)');
 // Three affine basis samples plus two brush cursor samples, independent of stroke count.
 expect(editor.shapeScreenPoint).toHaveBeenCalledTimes(5);
 host.clientWidth=900;frame();expect(mask()).toBe(previous);
 rect.left=120;frame();expect(mask()).toBe(previous);expect(cursor.attrs.cx).toBe('-10');
 expect(geometry.attrs.transform).toBe('matrix(2 0 0 2 -20 0)');
 editor.shapeTerrain={};frame();expect(mask()).toBe(previous);
 editor.paintPreview=structuredClone(editor.paintPreview);editor.paintPreview.shape.strokes.pop();frame();expect(mask()).not.toBe(previous);expect(mask().children).toHaveLength(1);
 editor.paintPreview.locked=true;editor.layers.revision++;frame();expect(cursor.style.display).toBe('none');
 view.pitch=.5;frame();overlay.destroy();
});
it('keeps mask bounds around all strokes when they pan in from outside the original viewport',()=>{
 const {overlay,frame,mask,geometry,view}=setup();frame();
 expect(mask().attrs.x).toBe('-2');expect(mask().attrs.width).toBe('804');
 expect(mask().attrs.y).toBe('-2');expect(mask().attrs.height).toBe('604');
 const fill=geometry.children[1];expect(fill.attrs.width).toBe(mask().attrs.width);
 const strokes=[...mask().children];view.x=999;view.z=1998;frame();expect(mask().children).toEqual(strokes);expect(mask().attrs.x).toBe('997');expect(Number(mask().attrs.width)).toBeCloseTo(7.01);
 overlay.destroy();
});
it('uses the original projection path for oblique or perspective views',()=>{
 const {overlay,frame,mask,view,geometry}=setup();view.pitch=Math.PI/2-.0001;frame();const previous=mask();
 expect(geometry.attrs.transform).toBe('');view.zoom=2;frame();expect(mask()).not.toBe(previous);expect(mask().children[1].attrs['stroke-width']).toBe('8');
 view.pitch=Math.PI/2;view.gameCam=true;frame();expect(geometry.attrs.transform).toBe('');overlay.destroy();
});

it('keeps a selected history mask unchanged while idle and skips snapshots without a selected layer',()=>{
 const {editor,overlay,frame,mask,projection}=setup();
 // Match the real history getter, not a stable test-only scene object.
 const scene=editor.layers.scene,read=vi.fn(()=>structuredClone(scene));
 Object.defineProperty(editor.layers,'scene',{get:read});
 Object.defineProperty(editor,'paintPreview',{value:null,writable:true});
 frame();const first=mask();editor.shapeScreenPoint.mockClear();projection.mockClear();
 for(let i=0;i<120;i++)frame();
 expect(read).toHaveBeenCalledTimes(1);expect(projection).not.toHaveBeenCalled();
 expect(editor.shapeScreenPoint).not.toHaveBeenCalled();expect(mask()).toBe(first);
 editor.layers.selection={kind:'object',id:'oak'};frame();
 for(let i=0;i<60;i++)frame();expect(read).toHaveBeenCalledTimes(1);
 editor.layers.selection={kind:'layer',id:'paint'};frame();expect(read).toHaveBeenCalledTimes(2);
 scene.layers[0]!.shape.strokes.pop();editor.layers.revision++;frame();expect(mask().children).toHaveLength(1);
 // A replacement history can have the same revision and selection.
 editor.layers={...editor.layers,scene:{layers:[{...scene.layers[0]!,shape:{type:'mask',strokes:[]}}]}};frame();expect(mask().children).toHaveLength(0);
 overlay.destroy();
});
it('prepares one projection per redraw regardless of mask point count',()=>{
 const {overlay,frame,projection,view}=setup();frame();expect(projection).toHaveBeenCalledTimes(1);
 view.zoom=2;frame();expect(projection).toHaveBeenCalledTimes(2);
 overlay.destroy();
});
