import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
export default defineConfig({
 root:fileURLToPath(new URL('../../../',import.meta.url)),
 server:{host:'127.0.0.1',port:5184,strictPort:true,hmr:false,fs:{deny:['**/.asset-work/**','**/.env*','**/*.{crt,pem}','**/.git/**']}},
 optimizeDeps:{entries:['scripts/bench/scenery-cells/index.html'],include:['three','three/addons/loaders/GLTFLoader.js']},
});
