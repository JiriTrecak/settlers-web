import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { localS3Plugin } from "./original_conv/viteS3";
import { localGraphicsPlugin, localMapsPlugin } from "./vite.s3";

export default defineConfig({
  plugins: [localS3Plugin(), localGraphicsPlugin(), localMapsPlugin()],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        viewer: fileURLToPath(new URL("./original_conv/viewer/index.html", import.meta.url)),
      },
    },
  },
});
