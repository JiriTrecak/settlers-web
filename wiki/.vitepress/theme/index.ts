import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import WikiHome from "./WikiHome.vue";
import WikiCatalog from "./WikiCatalog.vue";
import WikiMaps from "./WikiMaps.vue";
import "./custom.css";
export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("WikiHome", WikiHome);
    app.component("WikiCatalog", WikiCatalog);
    app.component("WikiMaps", WikiMaps);
  },
} satisfies Theme;
