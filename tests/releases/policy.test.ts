import {it,expect} from 'vitest';
import {assertReleaseBump} from '../../src/shared/release/policy';
it('uses patch releases for routine work and requires deliberate milestones',()=>{
 expect(()=>assertReleaseBump('0.2.0','0.2.1')).not.toThrow();
 expect(()=>assertReleaseBump('0.2.0','0.3.0')).toThrow('--milestone');
 expect(()=>assertReleaseBump('0.2.0','0.3.0',true)).not.toThrow();
 expect(()=>assertReleaseBump('0.6.4','0.7.0',true)).not.toThrow();
 expect(()=>assertReleaseBump('0.7.9','1.0.0')).toThrow('--milestone');
 expect(()=>assertReleaseBump('0.7.9','1.0.0',true)).not.toThrow();
});
it('rejects skipped, duplicate and older release versions',()=>{
 for(const next of ['0.2.0','0.1.9','0.2.2','0.7.0','0.3.1'])expect(()=>assertReleaseBump('0.2.0',next,true)).toThrow();
});
