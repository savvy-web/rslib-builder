import { readFile, stat } from "node:fs/promises";
import type { ProcessAssetsHandler } from "@rsbuild/core";
import { fileExistAsync } from "#utils/file-utils.js";

// Cache for file contents to improve performance in watch mode and repeated builds
export interface CacheEntry {
	content: string;
	mtime: number;
}

export type AssetCache = Map<string, CacheEntry>;

/**
 * Helper function to create asset emission processor with caching for improved performance
 */
export const createAssetProcessor =
	(filename: string, cache: AssetCache): ProcessAssetsHandler =>
	async (context: Parameters<ProcessAssetsHandler>[0]): Promise<void> => {
		const { assetName, assetPath, assetExists } = await fileExistAsync(filename);
		if (assetExists) {
			// Read and cache file content for repeated builds
			const cacheKey = `${filename}-${assetPath}`;
			const fileStats = await stat(assetPath);
			const currentMtime = fileStats.mtime.getTime();

			let content: string;
			const cachedEntry = cache.get(cacheKey);

			if (cachedEntry && cachedEntry.mtime === currentMtime) {
				// Use cached content if file hasn't changed
				content = cachedEntry.content;
			} else {
				// Read file and update cache
				content = await readFile(assetPath, "utf-8");
				cache.set(cacheKey, {
					content,
					mtime: currentMtime,
				});
			}

			const source = new context.sources.OriginalSource(content, assetName);
			context.compilation.emitAsset(assetName, source);
		}
	};
