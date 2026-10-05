import log from '../../../releases/log.json';
import config from '../../../src-tauri/tauri.conf.json';
import {releaseEntry,compareVersions} from './schema';
export const installedVersion=config.version;
export const installedRelease=releaseEntry.parse(log.releases.find(r=>r.version===installedVersion));
export const releaseBaseUrl='https://d3dte7yaa1v3g8.cloudfront.net';
export const installedHistory=log.releases.map(r=>releaseEntry.parse(r)).filter(r=>compareVersions(r.version,installedVersion)<=0).sort((a,b)=>compareVersions(b.version,a.version));
