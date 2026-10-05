import {describe,expect,it} from 'vitest';
import {resourceDepositVisual} from '../../src/render/settlement/resourceDepositVisual';

describe('amber deposit visuals',()=>{
  const asset='asset.resource.amber-seam';
  const pick=(amount:number|undefined)=>resourceDepositVisual('building.neutral.amber-mine',amount,12000,asset);
  it('changes only at the three mined thresholds',()=>{
    expect(pick(undefined)).toBe(asset);
    expect(pick(12000)).toBe(asset);
    expect(pick(8001)).toBe(asset);
    expect(pick(8000)).toBe('asset.resource.amber-seam-one-third');
    expect(pick(4001)).toBe('asset.resource.amber-seam-one-third');
    expect(pick(4000)).toBe('asset.resource.amber-seam-two-thirds');
    expect(pick(1)).toBe('asset.resource.amber-seam-two-thirds');
    expect(pick(0)).toBe('asset.resource.amber-seam-empty');
  });
  it('leaves other resources unchanged',()=>{
    expect(resourceDepositVisual('building.neutral.corrupted-root',0,3000,'asset.resource.corrupted-root')).toBe('asset.resource.corrupted-root');
  });
});
