import { describe, expect, it } from "vitest";
import { TSConfigs } from "../../tsconfig/index.js";

describe("@savvy-web/tsconfig exports", () => {
	// describe("main exports", () => {
	// 	it("should export all main components", async () => {
	// 		const exports = await import("../../src/api-extractor.js");

	// 		expect(exports.NodeLibraryBuilder).toBeDefined();
	// 		expect(exports.TSConfigs).toBeDefined();
	// 		expect(exports.AutoEntryPlugin).toBeDefined();
	// 		expect(exports.FilesArrayPlugin).toBeDefined();
	// 		expect(exports.JSRBundlelessPlugin).toBeDefined();
	// 		expect(exports.PackageJsonTransformPlugin).toBeDefined();

	// 		// Actually use the exports to ensure they're executed
	// 		expect(typeof exports.NodeLibraryBuilder.create).toBe("function");
	// 		expect(typeof exports.TSConfigs.root.file.resolve).toBe("function");
	// 		expect(typeof exports.AutoEntryPlugin).toBe("function");
	// 		expect(typeof exports.FilesArrayPlugin).toBe("function");
	// 		expect(typeof exports.JSRBundlelessPlugin).toBe("function");
	// 		expect(typeof exports.PackageJsonTransformPlugin).toBe("function");
	// 	});
	// });

	describe("TSConfig configurations", () => {
		it("should export root configuration", () => {
			expect(TSConfigs.root).toBeDefined();
			expect(TSConfigs.root.description).toBe("Root configuration for workspace setup");
			expect(TSConfigs.root.config).toBeDefined();
			expect(TSConfigs.root.pathname).toBeDefined();
		});

		it("should export Node.js ECMAScript configurations", () => {
			expect(TSConfigs.node.ecma).toBeDefined();
			expect(TSConfigs.node.ecma.lib).toBeDefined();

			// Test description
			expect(TSConfigs.node.ecma.lib.description).toBe("ECMAScript library build configuration");

			// Test lib has config and pathname properties
			expect(TSConfigs.node.ecma.lib.config).toBeDefined();
			expect(TSConfigs.node.ecma.lib.pathname).toBeDefined();
		});

		it("should provide dynamic bundle and bundleless methods on lib config", () => {
			const lib = TSConfigs.node.ecma.lib;

			// Test bundle method with different targets
			for (const target of ["dev", "npm"] as const) {
				const bundleConfig = lib.bundle(target);
				expect(bundleConfig).toBeDefined();
				expect(bundleConfig.compilerOptions?.outDir).toBe("dist");
				expect(bundleConfig.compilerOptions?.rootDir).toBe("../../../../../..");
				// tsBuildInfoFile is now an absolute path
				expect(bundleConfig.compilerOptions?.tsBuildInfoFile).toBe(
					`${process.cwd()}/dist/.tsbuildinfo.${target}.bundle`,
				);
				expect(bundleConfig.include).toBeDefined();
				// Bundle mode should not include __test__ or lib directories
				expect(bundleConfig.include?.some((p) => p.includes("__test__"))).toBe(false);
				expect(bundleConfig.include?.some((p) => p.includes("/lib/"))).toBe(false);
				// Should include src and types
				expect(bundleConfig.include?.some((p) => p.includes("/src/"))).toBe(true);
				expect(bundleConfig.include?.some((p) => p.includes("/types/"))).toBe(true);
			}

			// Test bundleless method with different targets
			for (const target of ["dev", "npm"] as const) {
				const bundlelessConfig = lib.bundleless(target);
				expect(bundlelessConfig).toBeDefined();
				expect(bundlelessConfig.compilerOptions?.outDir).toBe("dist");
				expect(bundlelessConfig.compilerOptions?.rootDir).toBe("../../../../../../src");
				// tsBuildInfoFile is now an absolute path
				expect(bundlelessConfig.compilerOptions?.tsBuildInfoFile).toBe(
					`${process.cwd()}/dist/.tsbuildinfo.${target}.bundleless`,
				);
				expect(bundlelessConfig.include).toBeDefined();
				// Bundleless mode should not include types, __test__, or lib directories
				expect(bundlelessConfig.include?.some((p) => p.includes("__test__"))).toBe(false);
				expect(bundlelessConfig.include?.some((p) => p.includes("/lib/"))).toBe(false);
				expect(bundlelessConfig.include?.some((p) => p.includes("/types/"))).toBe(false);
				// Should include src
				expect(bundlelessConfig.include?.some((p) => p.includes("/src/"))).toBe(true);
			}
		});

		it("should provide temp config file writing methods", () => {
			const lib = TSConfigs.node.ecma.lib;

			// Test writeBundleTempConfig with different targets
			expect(typeof lib.writeBundleTempConfig).toBe("function");
			for (const target of ["dev", "npm"] as const) {
				const bundleTempPath = lib.writeBundleTempConfig(target);
				expect(bundleTempPath).toBeDefined();
				expect(typeof bundleTempPath).toBe("string");
				expect(bundleTempPath).toMatch(/tsconfig-bundle-.*\.json$/);
			}

			// Test writeBundlelessTempConfig with different targets
			expect(typeof lib.writeBundlelessTempConfig).toBe("function");
			for (const target of ["dev", "npm"] as const) {
				const bundlelessTempPath = lib.writeBundlelessTempConfig(target);
				expect(bundlelessTempPath).toBeDefined();
				expect(typeof bundlelessTempPath).toBe("string");
				expect(bundlelessTempPath).toMatch(/tsconfig-bundleless-.*\.json$/);
			}
		});
	});

	describe("TypeScript types", () => {
		it("should export TSConfigJsonWithSchema type", () => {
			// Type exports are verified at compile time via TypeScript
			// We can verify the module exports by checking TSConfigs uses the type
			expect(TSConfigs.root.config.$schema).toBeDefined();
		});
	});

	describe("Legacy bundled getter", () => {
		it("should provide bundled getter for backward compatibility", () => {
			const lib = TSConfigs.node.ecma.lib;
			const bundled = lib.bundled;

			expect(bundled).toBeDefined();
			expect(bundled.compilerOptions?.outDir).toBeDefined();
			expect(typeof bundled).toBe("object");
		});
	});

	describe("Custom inspection", () => {
		it("should provide custom inspect output", () => {
			const lib = TSConfigs.node.ecma.lib;
			const inspectOutput = String(lib);

			expect(inspectOutput).toBeDefined();
			expect(typeof inspectOutput).toBe("string");
		});
	});
});
