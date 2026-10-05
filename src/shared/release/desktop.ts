import {isTauri} from '@tauri-apps/api/core';
import type {UpdateAdapter} from './updater';
export const isDesktop=()=>isTauri();
export const desktopUpdates:UpdateAdapter={
 async check(){const {check}=await import('@tauri-apps/plugin-updater');return check({timeout:30000});},
 async relaunch(){const {relaunch}=await import('@tauri-apps/plugin-process');await relaunch();},
};
