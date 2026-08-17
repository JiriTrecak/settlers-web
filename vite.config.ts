import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { localS3Plugin } from "./original_conv/viteS3";
import { localGraphicsPlugin, localMapsPlugin } from "./vite.s3";

export default defineConfig(({ command }) => ({
  // Packed zip is opened from a folder / subpath; fetch URLs use import.meta.env.BASE_URL.
  base: command === "build" ? "./" : "/",
  plugins: [localS3Plugin(), localGraphicsPlugin(), localMapsPlugin()],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      // Viewer stays a dev page; production is the game only.
      input: fileURLToPath(new URL("./index.html", import.meta.url)),
    },
  },
}));
