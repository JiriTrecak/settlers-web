import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { localGraphicsPlugin, localMapsPlugin, localS3Plugin } from "./vite.s3";

export default defineConfig({
  plugins: [localS3Plugin(), localGraphicsPlugin(), localMapsPlugin()],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        viewer: fileURLToPath(new URL("./viewer.html", import.meta.url)),
      },
    },
  },
});
