import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RsbuildPlugin, RsbuildPluginAPI } from "@rsbuild/core";
import type { PackageJson } from "../../types/package-json.js";
import type { BuildMode, PublishTarget, TransformPackageJsonFn } from "../builders/node-library-builder.js";

/**
 * Options for the PublishTargetPlugin.
 *
 * @public
 */
export interface PublishTargetPluginOptions {
	/**
	 * Publish targets to write output for.
	 *
	 * @remarks
	 * Each target gets a copy of the build staging output with per-target
	 * package.json transformations applied.
	 */
	targets: PublishTarget[];

	/**
	 * Absolute path to the build staging directory (dist/&lt;mode&gt;).
	 *
	 * @remarks
	 * Build artifacts are copied from this directory to each target's
	 * directory (when they differ).
	 */
	stagingDir: string;

	/**
	 * Current build mode.
	 */
	mode: BuildMode;

	/**
	 * Optional user transform function applied to each target's package.json.
	 *
	 * @remarks
	 * Called after copying the base package.json state for each target.
	 */
	transform?: TransformPackageJsonFn;

	/**
	 * Optional package name override.
	 *
	 * @remarks
	 * When provided, overrides the `name` field in each target's package.json.
	 */
	name?: string;
}

/**
 * Plugin to produce per-target output directories for multi-registry publishing.
 *
 * @remarks
 * Runs in `onCloseBuild` after the main RSlib build completes. For each
 * publish target:
 *
 * 1. Creates the target directory
 * 2. Copies all build output from the staging directory
 * 3. Reads the exposed `base-package-json` (after standard transforms, before user transform)
 * 4. Applies the user transform with the target-specific context
 * 5. Applies optional name override
 * 6. Copies the `files` array from the staging directory's package.json
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
				const { targets, stagingDir, mode, transform, name } = options;

				if (targets.length === 0) {
					return;
				}

				// Read the base package.json state exposed by PackageJsonTransformPlugin
				const basePackageJson = api.useExposed<PackageJson>("base-package-json");
				if (!basePackageJson) {
					return;
				}

				// Read the staging directory's package.json to get the files array
				const stagingPkgPath = join(stagingDir, "package.json");
				const stagingPkg = JSON.parse(readFileSync(stagingPkgPath, "utf-8")) as PackageJson;

				for (const target of targets) {
					// When the target directory differs from the staging directory, copy
					// all build artifacts so each target gets its own independent set.
					// Skip when they share a directory (e.g. multiple registries
					// publishing from the same dist/npm).
					if (target.directory !== stagingDir) {
						mkdirSync(target.directory, { recursive: true });
						cpSync(stagingDir, target.directory, { recursive: true });
					}

					// 3. Deep-copy the base package.json state
					let targetPkg = JSON.parse(JSON.stringify(basePackageJson)) as PackageJson;

					// 4. Apply user transform with target context
					if (transform) {
						targetPkg = transform({ mode, target, pkg: targetPkg });
					}

					// 5. Apply name override if configured
					if (name) {
						targetPkg.name = name;
					}

					// 6. Copy files array from staging directory's package.json
					if (stagingPkg.files) {
						targetPkg.files = [...stagingPkg.files];
					}

					// 7. Write package.json to target directory
					writeFileSync(join(target.directory, "package.json"), `${JSON.stringify(targetPkg, null, 2)}\n`);
				}
			});
		},
	};
};
