/**
 * Construction draw phases from `buildProgress`.
 * Fence until the first hammer. Scaffold grows through the first half,
 * finished hut through the second. Values in (0, 1) mean "clip with the saw mask".
 */
export type ConstructionVisual = {
  fence: boolean;
  /** 0 hidden, (0,1) growing, 1 full. */
  scaffold: number;
  built: number;
};

export function constructionVisual(progress: number): ConstructionVisual {
  if (progress < 0.01) return { fence: true, scaffold: 0, built: 0 };
  if (progress >= 0.99) return { fence: false, scaffold: 0, built: 1 };
  if (progress < 0.5) return { fence: false, scaffold: Math.min(1, progress * 2), built: 0 };
  return { fence: false, scaffold: 1, built: (progress * 2) % 1 };
}
