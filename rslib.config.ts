import { NodeLibraryBuilder } from "./src/index.js";

// Use our own builder - self-building example
export default NodeLibraryBuilder.create({
	bundle: true,
	apiReports: true,
	// Externalize build tools (peerDependencies) and internal cross-module imports
	externals: ["@rslib/core", "@rsbuild/core", "@rspack/core"],
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
