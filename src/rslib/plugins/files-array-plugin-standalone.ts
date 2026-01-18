import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RsbuildPlugin, RsbuildPluginAPI } from "@rsbuild/core";

interface PackageJson {
	files?: string[];
	[key: string]: unknown;
}

/**
 * Standalone plugin to manage the files array in package.json.
 * Copies README.md, package.json, and LICENSE to the build output
 * and adds all build assets to the files array.
 * @public
 */
export const FilesArrayPlugin = (): RsbuildPlugin => {
	return {
		name: "files-array-plugin",
		post: ["rsbuild:dts"],
		setup(api: RsbuildPluginAPI): void {
			let filesArray = api.useExposed("files-array") as Set<string> | undefined;
			if (!filesArray) {
				filesArray = new Set<string>();
				api.expose("files-array", filesArray);
			}

			// Stage 1: Copy essential files and collect all assets
			api.processAssets({ stage: "additional" }, async (context) => {
				const essentialFiles = ["package.json", "README.md", "LICENSE"];

				for (const fileName of essentialFiles) {
					// Check if already in compilation assets
					if (context.assets[fileName]) {
						filesArray.add(fileName);
						continue;
					}

					// Try to load from filesystem
					try {
						const filePath = join(process.cwd(), fileName);
						const content = await readFile(filePath, "utf-8");
						const source = new context.sources.RawSource(content);
						context.compilation.emitAsset(fileName, source);
						filesArray.add(fileName);
					} catch {
						// File doesn't exist, skip silently
					}
				}

				// Add all compiled assets (excluding source maps)
				for (const assetName of Object.keys(context.compilation.assets)) {
					if (!assetName.endsWith(".map") && !filesArray.has(assetName)) {
						filesArray.add(assetName);
					}
				}
			});

			// Stage 2: Update package.json with the files array
			api.processAssets({ stage: "optimize-inline" }, async (context) => {
				const pkgAsset = context.assets["package.json"];
				if (!pkgAsset) return;

				const pkgContent = pkgAsset.source().toString();
				const pkg: PackageJson = JSON.parse(pkgContent);

				// Merge existing files with new files
				const existingFiles = new Set(pkg.files || []);
				const allFiles = new Set([...existingFiles, ...filesArray]);

				if (allFiles.size > 0) {
					pkg.files = Array.from(allFiles).sort();
				} else {
					delete pkg.files;
				}

				const updatedSource = new context.sources.RawSource(JSON.stringify(pkg, null, "\t"));
				context.compilation.updateAsset("package.json", updatedSource);
			});
		},
	};
};
