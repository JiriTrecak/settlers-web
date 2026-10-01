import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';
import {spellEditor} from './server/plugin';
const root=fileURLToPath(new URL('.',import.meta.url));
export default defineConfig({root,cacheDir:'../../node_modules/.vite-spell-editor',plugins:[spellEditor(fileURLToPath(new URL('../..',import.meta.url)))],server:{host:'127.0.0.1',port:5177,strictPort:true,fs:{deny:['**/.asset-work/**','**/.env*','**/.git/**']}},build:{outDir:'dist',emptyOutDir:true}});
