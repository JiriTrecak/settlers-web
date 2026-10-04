/** Shared publication/runtime ceilings for decorative model effects. */
export const EFFECT_MODEL_LIMITS={instances:16,triangles:80000,perModelTriangles:10000,cachedModels:8,maxBytes:16*1024*1024} as const;
/** Includes mipmaps; pending entries are capped separately from resident memory. */
export const EFFECT_IMAGE_LIMITS={entries:80,cachedImages:16,maxBytes:8*1024*1024,maxDimension:2048,maxPixels:2048*2048,residentBytes:64*1024*1024} as const;
