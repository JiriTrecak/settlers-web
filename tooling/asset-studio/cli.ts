/** Uses the running local service, so agents and the UI share one publication lock/queue. */
import {readFile} from 'node:fs/promises';
const [operation='library',file]=process.argv.slice(2);
const base='http://127.0.0.1:5175/__studio';
const bootstrap=await fetch(base+'/bootstrap').then(r=>r.json());
const routes:Record<string,string>={library:'/library',jobs:'/jobs',create:'/jobs',assign:'/assignments',targets:'/assignments'};
let body=file?JSON.parse(await readFile(file,'utf8')):undefined;
if(body?.importFile){body.import=(await readFile(body.importFile)).toString('base64');delete body.importFile;}
const route=routes[operation]??(['process','approve','publish','cancel'].includes(operation)&&body?.job?`/jobs/${body.job}/${operation}`:undefined);
if(!route)throw Error('Usage: assets:studio library|jobs|create|process|approve|publish|cancel [request.json]');
const response=await fetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Studio-Token':bootstrap.token},body:body?JSON.stringify(body):undefined});
const result=await response.json();if(!response.ok)throw Error(result.error);console.log(JSON.stringify(result,null,2));
