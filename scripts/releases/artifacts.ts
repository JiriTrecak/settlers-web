import {createHash,createPublicKey,verify} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {z} from 'zod';
import {releaseEntry,releaseVersion} from '../../src/shared/release/schema.ts';
export const platformSchema=z.enum(['darwin-aarch64','darwin-x86_64','windows-x86_64','windows-aarch64','linux-x86_64','linux-aarch64']);
export const artifactSchema=z.object({schemaVersion:z.literal(1),version:releaseVersion,platform:platformSchema,filename:z.string().regex(/^[A-Za-z0-9._-]+$/),sha256:z.string().regex(/^[a-f0-9]{64}$/),bytes:z.number().int().positive().max(2*1024**3),signature:z.string().min(80).max(4096),changelog:releaseEntry}).strict().refine(a=>a.version===a.changelog.version,'Artifact and changelog versions differ');
export async function digestFile(file:string){const sha=createHash('sha256'),prehash=createHash('blake2b512');let bytes=0;for await(const b of createReadStream(file)){sha.update(b);prehash.update(b);bytes+=b.length;}return {sha256:sha.digest('hex'),prehash:prehash.digest(),bytes};}
/** Tauri uses minisign's prehashed Ed25519 signatures, including the trusted comment signature. */
export function verifySignature(pubkey:string,signature:string,prehash:Buffer,version?:string){
 const keyLines=Buffer.from(pubkey.trim(),'base64').toString('utf8').trim().split(/\r?\n/);
 const sigLines=Buffer.from(signature.trim(),'base64').toString('utf8').trim().split(/\r?\n/);
 const key=Buffer.from(keyLines[1]??'','base64'),sig=Buffer.from(sigLines[1]??'','base64'),global=Buffer.from(sigLines[3]??'','base64');
 if(key.length!==42||sig.length!==74||global.length!==64||key.toString('ascii',0,2)!=='Ed'||sig.toString('ascii',0,2)!=='ED'||!sig.subarray(2,10).equals(key.subarray(2,10))||!sigLines[2]?.startsWith('trusted comment: '))throw Error('Invalid updater signature or signing key');
 const publicKey=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),key.subarray(10)]),format:'der',type:'spki'});
 if(!verify(null,prehash,publicKey,sig.subarray(10))||!verify(null,Buffer.concat([sig.subarray(10),Buffer.from(sigLines[2].slice(17))]),publicKey,global))throw Error('Updater signature verification failed');
 if(version&&sigLines[2].slice(17).split('\t').find(f=>f.startsWith('version:'))?.slice(8)!==version)throw Error('Signature does not bind the expected release version');
}
