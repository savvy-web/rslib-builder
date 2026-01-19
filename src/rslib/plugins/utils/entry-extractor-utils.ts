/**
 * @deprecated Use `EntryExtractor` class or `extractEntriesFromPackageJson` from `#utils/entry-extractor.js` instead.
 * This module re-exports from the class-based implementation for backward compatibility.
 * @module
 */

export type { EntryExtractorOptions, ExtractedEntries } from "#utils/entry-extractor.js";
export { extractEntriesFromPackageJson } from "#utils/entry-extractor.js";
