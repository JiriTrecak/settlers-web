import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('../../../',import.meta.url)),server:{host:'127.0.0.1',port:5186,strictPort:true,hmr:false,fs:{deny:['**/.asset-work/**','**/.env*','**/*.{crt,pem}','**/.git/**']}}});
