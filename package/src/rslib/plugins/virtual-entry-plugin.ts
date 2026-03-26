import type { RsbuildPlugin, RsbuildPluginAPI } from "@rsbuild/core";

/**
 * Options for the VirtualEntryPlugin.
 *
 * @remarks
 * Virtual entries are used for special files that need bundling but should not
 * generate type declarations or appear in package.json exports. Common use cases
 * include pnpmfile.cjs or other configuration files.
 *
 * @public
 */
export interface VirtualEntryPluginOptions {
	/**
	 * Set of virtual entry names (without file extensions).
	 *
	 * @remarks
	 * These names are exposed to DtsPlugin to skip type generation.
	 * For example, if `virtualEntryNames` contains `"pnpmfile"`, the
	 * entry `pnpmfile.cjs` will be bundled but no `pnpmfile.d.ts` will be generated.
	 */
	virtualEntryNames: Set<string>;
}

/**
 * Plugin to handle virtual entry points in RSlib builds.
 *
 * @remarks
 * Virtual entries are special entry points that:
 * - Are bundled like regular entries
 * - Do NOT generate TypeScript declarations (.d.ts files)
 * - Are NOT added to package.json exports
 * - ARE added to package.json files array for publishing
 *
 * This plugin:
 * 1. Exposes the virtual entry names for DtsPlugin to skip type generation
 * 2. Adds virtual entry outputs to the files array in the additional stage
 *
 * @example
 * ```typescript
 * import { VirtualEntryPlugin } from '@savvy-web/rslib-builder';
 *
 * const plugin = VirtualEntryPlugin({
 *   virtualEntryNames: new Set(['pnpmfile']),
 * });
 * ```
 *
 * @public
 */
export const VirtualEntryPlugin = (options: VirtualEntryPluginOptions): RsbuildPlugin => {
	const { virtualEntryNames } = options;

	return {
		name: "virtual-entry-plugin",
		setup(api: RsbuildPluginAPI): void {
			// Expose virtual entry names for DtsPlugin to skip type generation
			api.expose("virtual-entry-names", virtualEntryNames);

			// Add virtual entry outputs to files array
			api.processAssets(
				{
					stage: "additional",
				},
				async (context) => {
					// Get or create the shared files array
					// biome-ignore lint/correctness/useHookAtTopLevel: Rsbuild plugin API, not React hooks
					let filesArray = api.useExposed("files-array") as Set<string> | undefined;
					if (!filesArray) {
						filesArray = new Set<string>();
						api.expose("files-array", filesArray);
					}

					// Add virtual entry outputs to files array
					for (const assetName of Object.keys(context.compilation.assets)) {
						// Extract base name without extension
						const baseName = assetName.replace(/\.(c|m)?js$/, "");

						if (virtualEntryNames.has(baseName)) {
							filesArray.add(assetName);
						}
					}
				},
			);
		},
	};
};
