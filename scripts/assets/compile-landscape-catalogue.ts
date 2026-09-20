import {readPublished} from '../../tooling/asset-studio/server/authoring/publication';
import {landscapeCatalogue} from '../../src/shared/authoring/catalogue';
import {saveJson} from '../../tooling/asset-studio/server/storage';
const published=await readPublished(process.cwd());if(!published)throw Error('Initialize canonical publication first');
await saveJson('assets/authoring/catalogue.json',landscapeCatalogue(published));
