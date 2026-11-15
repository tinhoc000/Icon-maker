/**
 * Cache rules for the background-removal model files (served from /models/).
 *
 * Each function must stay self-contained (no calls to the other, no imports): the build copies its
 * source text into the service worker, where this module does not exist.
 */

/** The list of model files. Fetched fresh when online so a library upgrade is noticed. */
export const isModelManifest = ({ url }: { url: URL }): boolean => url.pathname.endsWith('/models/resources.json');

/** The model's pieces are named by their content hash, so a cached copy is always right. */
export const isModelChunk = ({ url }: { url: URL }): boolean =>
  url.pathname.includes('/models/') && !url.pathname.endsWith('/models/resources.json');
