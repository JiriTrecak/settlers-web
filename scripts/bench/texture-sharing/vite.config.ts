import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
/** Isolated renderer benchmark: does not load or mutate game/editor documents. */
export default defineConfig({
 root:fileURLToPath(new URL('../../../',import.meta.url)),
 server:{host:'127.0.0.1',port:5184,strictPort:true,hmr:false,fs:{deny:['**/.asset-work/**','**/.env*','**/*.{crt,pem}','**/.git/**']}},
 optimizeDeps:{entries:['scripts/bench/texture-sharing/index.html'],include:['three','three/addons/loaders/GLTFLoader.js']},
});
