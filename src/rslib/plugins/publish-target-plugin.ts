import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RsbuildPlugin, RsbuildPluginAPI } from "@rsbuild/core";
import type { PackageJson } from "../../types/package-json.js";
import type { PublishTarget, TransformPackageJsonFn } from "../builders/node-library-builder.js";

/**
 * Options for the PublishTargetPlugin.
 *
 * @public
 */
export interface PublishTargetPluginOptions {
	/**
	 * Additional publish targets to write output for (targets beyond the primary).
	 *
	 * @remarks
	 * Each target gets a copy of the primary build output with per-target
	 * package.json transformations applied.
	 */
	additionalTargets: PublishTarget[];

	/**
	 * Absolute path to the primary output directory.
	 *
	 * @remarks
	 * The primary build output is copied from this directory to each
	 * additional target's directory.
	 */
	primaryOutdir: string;

	/**
	 * Current build mode (e.g., "npm").
	 */
	mode: string;

	/**
	 * Optional user transform function applied to each target's package.json.
	 *
	 * @remarks
	 * Called after copying the base package.json state for each additional target.
	 */
	transform?: TransformPackageJsonFn;

	/**
	 * Optional package name override.
	 *
	 * @remarks
	 * When provided, overrides the `name` field in each additional target's package.json.
	 */
	name?: string;
}

/**
 * Plugin to produce per-target output directories for multi-registry publishing.
 *
 * @remarks
 * Runs in `onCloseBuild` after the primary build completes. For each additional
 * publish target (beyond the primary):
 *
 * 1. Creates the target directory
 * 2. Copies all build output from the primary output directory
 * 3. Reads the exposed `base-package-json` (after standard transforms, before user transform)
 * 4. Applies the user transform with the target-specific context
 * 5. Applies optional name override
 * 6. Copies the `files` array from the primary output's package.json
 * 7. Writes the final package.json to the target directory
 *
 * @param options - Plugin configuration options
 *
 * @public
 */
export const PublishTargetPlugin = (options: PublishTargetPluginOptions): RsbuildPlugin => {
	return {
		name: "publish-target-plugin",
		setup(api: RsbuildPluginAPI): void {
			api.onCloseBuild(async () => {
				const { additionalTargets, primaryOutdir, mode, transform, name } = options;

				if (additionalTargets.length === 0) {
					return;
				}

				// Read the base package.json state exposed by PackageJsonTransformPlugin
				const basePackageJson = api.useExposed<PackageJson>("base-package-json");
				if (!basePackageJson) {
					return;
				}

				// Read the primary output's package.json to get the files array
				const primaryPkgPath = join(primaryOutdir, "package.json");
				const primaryPkg = JSON.parse(readFileSync(primaryPkgPath, "utf-8")) as PackageJson;

				for (const target of additionalTargets) {
					// 1. Create target directory
					mkdirSync(target.directory, { recursive: true });

					// 2. Copy all build output from primary
					cpSync(primaryOutdir, target.directory, { recursive: true });

					// 3. Deep-copy the base package.json state
					let targetPkg = JSON.parse(JSON.stringify(basePackageJson)) as PackageJson;

					// 4. Apply user transform with target context
					if (transform) {
						targetPkg = transform({ mode: mode as "dev" | "npm", target, pkg: targetPkg });
					}

					// 5. Apply name override if configured
					if (name) {
						targetPkg.name = name;
					}

					// 6. Copy files array from primary output's package.json
					if (primaryPkg.files) {
						targetPkg.files = [...primaryPkg.files];
					}

					// 7. Write package.json to target directory
					writeFileSync(join(target.directory, "package.json"), `${JSON.stringify(targetPkg, null, 2)}\n`);
				}
			});
		},
	};
};
