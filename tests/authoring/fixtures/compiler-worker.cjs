// Browser entry under Node: exercise the production worker, not a second runtime.
const {parentPort}=require('node:worker_threads');
require('tsx/cjs');
globalThis.self=globalThis;
globalThis.postMessage=(message,transfer)=>parentPort.postMessage(message,transfer);
globalThis.onmessage=null;
require('../../../src/shared/authoring/worker/entry.ts');
parentPort.on('message',data=>globalThis.self.onmessage({data}));
