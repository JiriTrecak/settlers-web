import {it,expect} from 'vitest';
import {missionSchema} from '../../src/shared/scenario/schema';
const mission={campaign:'test',title:'Test',order:1,script:'function on_start() end',regions:[]};
it('keeps old missions compatible and preserves editable loading copy',()=>{
 expect(missionSchema.parse(mission).presentation).toBeUndefined();
 const presentation={loadingBackground:'asset.interface.campaign.amber-watch-loading',selectionBackground:'asset.interface.campaign.amber-watch-selection',briefing:'First line.\nSecond line.',tips:['Stay together.'],features:['One hero']};
 expect(missionSchema.parse({...mission,presentation}).presentation).toEqual(presentation);
});
it('rejects remote or malformed image references and excessive copy',()=>{
 for(const presentation of [{loadingBackground:'https://example.com/image.webp'},{loadingBackground:'../../secret'},{loadingBackground:'asset.models.units.ants-warrior'},{tips:Array(13).fill('Tip')},{features:Array(5).fill('Feature')},{briefing:'a'.repeat(1201)}])expect(missionSchema.safeParse({...mission,presentation}).success).toBe(false);
});
