import type {UtcMap} from '../../map/utcmap';
import type {Packet} from './transfer';
/** Omitted fields retain their exact worker-side identity. Explicit undefined removes them. */
export type CompileRequest={id:number;patch:Partial<UtcMap>};
export type CompileReply={id:number;packet:Packet;compileMs:number;encodeMs:number}|{id:number;error:string};
export interface CompilerPort{
 postMessage(message:CompileRequest):void;
 terminate():void;
 onmessage:((event:MessageEvent<CompileReply>)=>void)|null;
 onerror:((event:ErrorEvent)=>void)|null;
 onmessageerror:((event:MessageEvent)=>void)|null;
}
