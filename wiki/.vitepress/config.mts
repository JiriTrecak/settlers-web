import { defineConfig } from "vitepress";
import navigation from "../.generated/navigation.json";

const base = process.env.WIKI_BASE ?? "/";
if (!base.startsWith("/") || !base.endsWith("/"))
  throw new Error("WIKI_BASE must start and end with / (for example /wiki/).");
export default defineConfig({
  title: "Under the Canopy",
  description:
    "The field guide to colonies, creatures and conflict beneath the forest canopy.",
  lang: "en-US",
  base,
  srcDir: ".generated",
  appearance: "dark",
  lastUpdated: false,
  head: [["meta", { name: "theme-color", content: "#141e1b" }]],
  themeConfig: {
    siteTitle: "UNDER THE CANOPY",
    nav: [
      { text: "Game guide", link: "/guide/getting-started" },
      {
        text: "Encyclopedia",
        items: [
          { text: "Buildings", link: "/buildings/" },
          { text: "Units", link: "/units/" },
          { text: "Items", link: "/items/" },
          { text: "Abilities", link: "/abilities/" },
          { text: "Resources", link: "/resources/" },
        ],
      },
      { text: "Map atlas", link: "/maps/" },
      { text: "Devlog", link: "/devlog/" },
      { text: "Development", link: "/development/" },
    ],
    sidebar: navigation,
    outline: { level: [2, 3], label: "On this page" },
    search: { provider: "local", options: { detailedView: true } },
    footer: {
      message:
        "A living field guide. Game data is generated; design history is labeled.",
      copyright: "Under the Canopy · development wiki",
    },
    docFooter: { prev: "Previous entry", next: "Next entry" },
  },
});
