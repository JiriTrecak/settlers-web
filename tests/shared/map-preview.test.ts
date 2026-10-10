import {afterEach,expect,it,vi} from 'vitest';
import {mapPreview} from '../../src/ui/menu/mapPreview';
import {mapOverview} from '../../src/shared/map/overview';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import type {MapEntry} from '../../src/shared/map/library';
class Element {
 children:Element[]=[];attributes=new Map<string,string>();src='';onerror:(()=>void)|null=null;
 constructor(readonly tag:string){}
 setAttribute(k:string,v:string){this.attributes.set(k,v);}
 append(...nodes:Element[]){this.children.push(...nodes);}
 replaceChildren(...nodes:Element[]){this.children=nodes;}
}
afterEach(()=>vi.unstubAllGlobals());
function fixture(custom=false){
 vi.stubGlobal('document',{createElement:(tag:string)=>new Element(tag),createElementNS:(_:string,tag:string)=>new Element(tag)});
 const info=mapOverview(emptyUtcMap());info.starts=[{player:1,x:30,z:30,setup:'default',mainFort:'building.ants.hall'},{player:2,x:90,z:90,setup:'default',mainFort:'building.ants.hall'}];info.custom=custom;
 return {id:'test',name:'Test',players:2,source:'project',overview:info,previewUrl:'/published.webp'} satisfies MapEntry;
}
it('composes a static image and selection markers using only published metadata',()=>{
 const root=mapPreview(fixture(),0) as unknown as Element;
 expect(root.children.map(c=>c.tag)).toEqual(['img','svg']);
 expect(root.children[0].src).toBe('/published.webp');
 expect(root.children[1].children).toHaveLength(1);
 expect(root.children[1].children[0].children[0].attributes.get('r')).toBe('15');
 expect(root.children[1].children[0].children).toHaveLength(1);
});
it('preserves custom art without superimposing map coordinates',()=>{
 const root=mapPreview(fixture(true),0) as unknown as Element;
 expect(root.children.map(c=>c.tag)).toEqual(['img']);
});
it('uses a static fallback if an image cannot load, without generating terrain',()=>{
 const root=mapPreview(fixture(),null) as unknown as Element,img=root.children[0];
 img.onerror!();expect(img.src).toMatch(/^data:image\/svg\+xml/);expect(img.onerror).toBeNull();
 expect(root.children[1].children).toHaveLength(2);
 expect(root.children[1].children[0].children).toHaveLength(3);
});
