import { NodeLibraryBuilder } from "./src/index.js";

// Use our own builder - self-building example
export default NodeLibraryBuilder.create({
	// Generate API model for npm mode (used by documentation tooling)
	// Set RSLIB_BUILDER_LOCAL_PATH env var for local API model path resolution
	apiModel: {
		...(process.env.RSLIB_BUILDER_LOCAL_PATH && { localPaths: [process.env.RSLIB_BUILDER_LOCAL_PATH] }),
		tsdoc: {
			tagDefinitions: [
				{
					tagName: "@category",
					syntaxKind: "modifier",
				},
				{
					tagName: "@default",
					syntaxKind: "modifier",
				},
			],
		},
	},
	// Externalize build tools (peerDependencies) and internal cross-module imports
	// source-map-support is optionally required by TypeScript internals (in try/catch)
	externals: ["@rslib/core", "@rspack/core", "typescript", "source-map-support"],
	copyPatterns: [
		{
			from: "./**/*.json",
			context: "./src/public",
		},
	],
	transform({ pkg }) {
		delete pkg.devDependencies;
		delete pkg.bundleDependencies;
		delete pkg.scripts;
		delete pkg.packageManager;
		delete pkg.publishConfig;
		delete pkg.devEngines;
		return pkg;
	},
});
