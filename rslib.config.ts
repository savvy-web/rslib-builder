import { NodeLibraryBuilder } from "./src/index.js";

// Use our own builder - self-building example
export default NodeLibraryBuilder.create({
	bundle: true,
	apiReports: true,
	// Externalize build tools (peerDependencies) and internal cross-module imports
	// source-map-support is optionally required by TypeScript internals (in try/catch)
	externals: ["@rslib/core", "@rsbuild/core", "@rspack/core", "source-map-support"],
	dtsBundledPackages: [],
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
		return pkg;
	},
});
