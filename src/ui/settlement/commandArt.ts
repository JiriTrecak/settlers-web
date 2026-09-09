import { content } from "../../content/builtin";

// Only the game-sized 128px images enter the bundle. Authoring originals live outside assets.
const images = import.meta.glob("../../../assets/ui/icons/**/*.png", {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>;

export function iconArt(id: string): string {
  const path = content.asset(id).image;
  const url = images[`../../../${path}`];
  if (!url) throw new Error(`Missing declared icon image: ${id} (${path})`);
  const escaped = url.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  return `<span class="rts-art" style="background-image:url(&quot;${escaped}&quot;)" aria-hidden="true"></span>`;
}
