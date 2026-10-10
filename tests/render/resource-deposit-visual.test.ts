import {expect,it} from 'vitest';
import {resourceDepositAssets,resourceDepositVisual} from '../../src/render/settlement/resourceDepositVisual';
const definition = {asset:'full-1',yield:4500,resourceVisuals:{
 variants:['full-1','full-2','full-3','full-4','full-5'],
 stages:[{remaining:0,asset:'empty'},{remaining:1/3,asset:'low'}],
}};
it.each(definition.resourceVisuals.variants)('preserves %s until one third remains, then shares low and empty',asset=>{
 expect(resourceDepositVisual(definition,2700,2700,asset)).toBe(asset);
 expect(resourceDepositVisual(definition,901,2700,asset)).toBe(asset);
 expect(resourceDepositVisual(definition,900,2700,asset)).toBe('low');
 expect(resourceDepositVisual(definition,1,2700,asset)).toBe('low');
 expect(resourceDepositVisual(definition,0,2700,asset)).toBe('empty');
});
it('preloads every full shape and shared stage exactly once',()=>{
 expect(resourceDepositAssets(definition)).toEqual(['full-1','full-2','full-3','full-4','full-5','empty','low']);
});
it('leaves other resources and uninitialized editor previews intact',()=>{
 expect(resourceDepositVisual({asset:'root',yield:100},0,100,'custom-root')).toBe('custom-root');
 expect(resourceDepositVisual(definition,undefined,undefined,'full-4')).toBe('full-4');
 expect(resourceDepositVisual(definition,0,0,'full-4')).toBe('empty');
 expect(resourceDepositAssets({asset:'root'})).toEqual(['root']);
});
