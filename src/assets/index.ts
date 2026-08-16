import type { ImageRef } from "../shared";

export type { ImageRef } from "../shared";
export { DatArchive, parseDat, parseDatFileName, type DecodedImage, type SeqKind } from "./dat";

export type ImageMeta = {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
};

export interface AssetSource {
  readonly ready: boolean;
  get(ref: ImageRef): ImageMeta | null;
}

export class NullAssetSource implements AssetSource {
  readonly ready = false;

  get(_ref: ImageRef): ImageMeta | null {
    return null;
  }
}
