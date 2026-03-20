import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RslibConfig } from "@rslib/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NodeLibraryBuilder } from "./node-library-builder.js";

// Mock node:fs
vi.mock("node:fs", () => ({
	existsSync: vi.fn(),
	readFileSync: vi.fn(),
}));

// Mock node:path
vi.mock("node:path", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:path")>();
	return {
		...actual,
		join: vi.fn((...args: string[]) => args.join("/")),
	};
});

// Capture defineConfig args
let capturedConfig: RslibConfig | undefined;
vi.mock("@rslib/core", () => ({
	defineConfig: vi.fn((config: RslibConfig) => {
		capturedConfig = config;
		return config;
	}),
}));

// Mock plugins to return identifiable objects
vi.mock("../plugins/auto-entry-plugin.js", () => ({
	AutoEntryPlugin: vi.fn((opts: unknown) => ({ name: "auto-entry-plugin", _opts: opts })),
}));
vi.mock("../plugins/dts-plugin.js", () => ({
	DtsPlugin: vi.fn(() => ({ name: "dts-plugin" })),
}));
vi.mock("../plugins/files-array-plugin.js", () => ({
	FilesArrayPlugin: vi.fn(() => ({ name: "files-array-plugin" })),
}));
vi.mock("../plugins/package-json-transform-plugin.js", () => ({
	PackageJsonTransformPlugin: vi.fn(() => ({ name: "package-json-transform-plugin" })),
}));
vi.mock("../plugins/tsdoc-lint-plugin.js", () => ({
	TsDocLintPlugin: vi.fn(() => ({ name: "tsdoc-lint-plugin" })),
}));
vi.mock("../plugins/virtual-entry-plugin.js", () => ({
	VirtualEntryPlugin: vi.fn(() => ({ name: "virtual-entry-plugin" })),
}));
vi.mock("../plugins/publish-target-plugin.js", () => ({
	PublishTargetPlugin: vi.fn(() => ({ name: "publish-target-plugin" })),
}));
vi.mock("../plugins/utils/file-utils.js", () => ({
	packageJsonVersion: vi.fn().mockResolvedValue("1.0.0"),
}));

// Mock import graph for bundleless entry computation
const mockTraceFromEntries = vi.fn().mockReturnValue({
	files: ["/test/cwd/src/index.ts"],
	entries: ["/test/cwd/src/index.ts"],
	errors: [],
});
vi.mock("../plugins/utils/import-graph.js", () => ({
	ImportGraph: class MockImportGraph {
		traceFromEntries = mockTraceFromEntries;
	},
}));
vi.mock("../plugins/utils/entry-extractor.js", () => ({
	EntryExtractor: class MockEntryExtractor {
		extract = vi.fn().mockReturnValue({
			entries: { index: "./src/index.ts" },
		});
	},
}));

// Import mocked plugins to inspect calls
import { AutoEntryPlugin } from "../plugins/auto-entry-plugin.js";
import { DtsPlugin } from "../plugins/dts-plugin.js";
import { FilesArrayPlugin } from "../plugins/files-array-plugin.js";
import { PackageJsonTransformPlugin } from "../plugins/package-json-transform-plugin.js";
import { PublishTargetPlugin } from "../plugins/publish-target-plugin.js";

describe("NodeLibraryBuilder", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		capturedConfig = undefined;
	});

	describe("DEFAULT_OPTIONS", () => {
		it("should have expected default values", () => {
			expect(NodeLibraryBuilder.DEFAULT_OPTIONS).toEqual({
				format: "esm",
				plugins: [],
				define: {},
				copyPatterns: [],
				targets: ["dev", "npm"],
				externals: [],
				apiModel: true,
				bundle: true,
				cjsInterop: false,
			});
		});
	});

	describe("mergeOptions", () => {
		it("should return default options when no options provided", () => {
			vi.mocked(existsSync).mockReturnValue(false);

			const result = NodeLibraryBuilder.mergeOptions();

			expect(result).toEqual(NodeLibraryBuilder.DEFAULT_OPTIONS);
		});

		it("should merge provided options with defaults", () => {
			vi.mocked(existsSync).mockReturnValue(false);

			const result = NodeLibraryBuilder.mergeOptions({
				targets: ["npm"],
			});

			expect(result).toMatchObject({
				targets: ["npm"],
				// Should still have defaults for other properties
				plugins: [],
				define: {},
				copyPatterns: [],
			});
		});

		it("should add public directory to copyPatterns when it exists", () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(join).mockReturnValue("/test/cwd/public");

			const result = NodeLibraryBuilder.mergeOptions();

			expect(existsSync).toHaveBeenCalledWith("/test/cwd/public");
			expect(result.copyPatterns).toHaveLength(1);
			expect(result.copyPatterns[0]).toEqual({
				from: "./public",
				to: "./",
				context: process.cwd(),
			});
		});

		it("should not add public directory to copyPatterns when it does not exist", () => {
			vi.mocked(existsSync).mockReturnValue(false);

			const result = NodeLibraryBuilder.mergeOptions();

			expect(result.copyPatterns).toHaveLength(0);
		});

		it("should prepend public directory pattern to existing copyPatterns", () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(join).mockReturnValue("/test/cwd/public");

			const customPatterns = [{ from: "./assets", to: "./assets" }];
			const result = NodeLibraryBuilder.mergeOptions({
				copyPatterns: customPatterns,
			});

			expect(result.copyPatterns).toHaveLength(2);
			expect(result.copyPatterns[0]).toEqual({
				from: "./public",
				to: "./",
				context: process.cwd(),
			});
			expect(result.copyPatterns[1]).toEqual({ from: "./assets", to: "./assets" });
		});

		it("should handle partial options correctly", () => {
			vi.mocked(existsSync).mockReturnValue(false);

			const result = NodeLibraryBuilder.mergeOptions({
				externals: ["react", "react-dom"],
				dtsBundledPackages: ["@types/node"],
			});

			expect(result.externals).toEqual(["react", "react-dom"]);
			expect(result.dtsBundledPackages).toEqual(["@types/node"]);
		});

		it("should preserve user-provided plugins array", () => {
			vi.mocked(existsSync).mockReturnValue(false);

			const mockPlugin = { name: "test-plugin", setup: vi.fn() };
			const result = NodeLibraryBuilder.mergeOptions({
				plugins: [mockPlugin],
			});

			expect(result.plugins).toHaveLength(1);
			expect(result.plugins[0]).toBe(mockPlugin);
		});

		it("should allow overriding targets", () => {
			vi.mocked(existsSync).mockReturnValue(false);

			const result = NodeLibraryBuilder.mergeOptions({
				targets: ["npm"],
			});

			expect(result.targets).toEqual(["npm"]);
		});

		it("should default bundle to true", () => {
			vi.mocked(existsSync).mockReturnValue(false);

			const result = NodeLibraryBuilder.mergeOptions();

			expect(result.bundle).toBe(true);
		});

		it("should preserve bundle: false when explicitly set", () => {
			vi.mocked(existsSync).mockReturnValue(false);

			const result = NodeLibraryBuilder.mergeOptions({
				bundle: false,
			});

			expect(result.bundle).toBe(false);
		});

		it("should preserve bundle: true when explicitly set", () => {
			vi.mocked(existsSync).mockReturnValue(false);

			const result = NodeLibraryBuilder.mergeOptions({
				bundle: true,
			});

			expect(result.bundle).toBe(true);
		});
	});

	describe("createSingleMode", () => {
		const mockPackageJson = JSON.stringify({
			name: "test-pkg",
			version: "1.0.0",
			exports: { ".": "./src/index.ts" },
		});

		beforeEach(() => {
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(readFileSync).mockReturnValue(mockPackageJson);
		});

		it("should set outBase to outputDir when bundle is true", async () => {
			const options = NodeLibraryBuilder.mergeOptions({ bundle: true });
			await NodeLibraryBuilder.createSingleMode("npm", options);

			const lib = capturedConfig?.lib?.[0];
			expect(lib).toBeDefined();
			expect(lib?.outBase).toBe("dist/npm");
		});

		it("should set outBase to 'src' when bundle is false", async () => {
			const options = NodeLibraryBuilder.mergeOptions({ bundle: false });
			await NodeLibraryBuilder.createSingleMode("npm", options);

			const lib = capturedConfig?.lib?.[0];
			expect(lib).toBeDefined();
			expect(lib?.outBase).toBe("src");
		});

		it("should pass bundleless: true to AutoEntryPlugin when bundle is false", async () => {
			const options = NodeLibraryBuilder.mergeOptions({ bundle: false });
			await NodeLibraryBuilder.createSingleMode("npm", options);

			expect(AutoEntryPlugin).toHaveBeenCalledWith(expect.objectContaining({ bundleless: true }));
		});

		it("should not pass bundleless to AutoEntryPlugin when bundle is true", async () => {
			const options = NodeLibraryBuilder.mergeOptions({ bundle: true });
			await NodeLibraryBuilder.createSingleMode("npm", options);

			// Should be called with empty object (no bundleless key)
			const callArgs = vi.mocked(AutoEntryPlugin).mock.calls[0][0];
			expect(callArgs).toBeDefined();
			expect(callArgs).not.toHaveProperty("bundleless");
		});

		it("should pass both bundleless and exportsAsIndexes when both are set", async () => {
			const options = NodeLibraryBuilder.mergeOptions({ bundle: false, exportsAsIndexes: true });
			await NodeLibraryBuilder.createSingleMode("npm", options);

			expect(AutoEntryPlugin).toHaveBeenCalledWith(
				expect.objectContaining({ bundleless: true, exportsAsIndexes: true }),
			);
		});

		it("should set bundle: false on lib config when bundle option is false", async () => {
			const options = NodeLibraryBuilder.mergeOptions({ bundle: false });
			await NodeLibraryBuilder.createSingleMode("npm", options);

			const lib = capturedConfig?.lib?.[0];
			expect(lib?.bundle).toBe(false);
		});

		it("should set legalComments to 'inline' when bundle is false", async () => {
			const options = NodeLibraryBuilder.mergeOptions({ bundle: false });
			await NodeLibraryBuilder.createSingleMode("npm", options);

			const lib = capturedConfig?.lib?.[0];
			expect(lib?.output?.legalComments).toBe("inline");
		});

		it("should not set legalComments when bundle is true", async () => {
			const options = NodeLibraryBuilder.mergeOptions({ bundle: true });
			await NodeLibraryBuilder.createSingleMode("npm", options);

			const lib = capturedConfig?.lib?.[0];
			expect(lib?.output?.legalComments).toBeUndefined();
		});

		describe("dual format", () => {
			it("should set distPath.root to baseOutputDir and distPath.js to primary format", async () => {
				const options = NodeLibraryBuilder.mergeOptions({ format: ["esm", "cjs"] });
				await NodeLibraryBuilder.createSingleMode("npm", options);

				const primaryLib = capturedConfig?.lib?.[0];
				expect(primaryLib?.output?.distPath).toEqual({ root: "dist/npm", js: "esm" });
			});

			it("should set distPath.js to secondary format on secondary lib config", async () => {
				const options = NodeLibraryBuilder.mergeOptions({ format: ["esm", "cjs"] });
				await NodeLibraryBuilder.createSingleMode("npm", options);

				const secondaryLib = capturedConfig?.lib?.[1];
				expect(secondaryLib?.output?.distPath).toEqual({ root: "dist/npm", js: "cjs" });
			});

			it("should set outBase to baseOutputDir for both primary and secondary in bundle mode", async () => {
				const options = NodeLibraryBuilder.mergeOptions({ format: ["esm", "cjs"], bundle: true });
				await NodeLibraryBuilder.createSingleMode("npm", options);

				const primaryLib = capturedConfig?.lib?.[0];
				const secondaryLib = capturedConfig?.lib?.[1];
				expect(primaryLib?.outBase).toBe("dist/npm");
				expect(secondaryLib?.outBase).toBe("dist/npm");
			});

			it("should pass dtsPathPrefix to primary DtsPlugin", async () => {
				const options = NodeLibraryBuilder.mergeOptions({ format: ["esm", "cjs"] });
				await NodeLibraryBuilder.createSingleMode("npm", options);

				// Primary DtsPlugin is the last call (called after secondary)
				const dtsCalls = vi.mocked(DtsPlugin).mock.calls;
				const primaryCall = dtsCalls[0][0];
				expect(primaryCall).toMatchObject({ dtsPathPrefix: "esm" });
			});

			it("should pass dtsPathPrefix to secondary DtsPlugin", async () => {
				const options = NodeLibraryBuilder.mergeOptions({ format: ["esm", "cjs"] });
				await NodeLibraryBuilder.createSingleMode("npm", options);

				const dtsCalls = vi.mocked(DtsPlugin).mock.calls;
				const secondaryCall = dtsCalls[1][0];
				expect(secondaryCall).toMatchObject({ dtsPathPrefix: "cjs" });
			});

			it("should not set distPath.js for single format builds", async () => {
				const options = NodeLibraryBuilder.mergeOptions({ format: "esm" });
				await NodeLibraryBuilder.createSingleMode("npm", options);

				const lib = capturedConfig?.lib?.[0];
				expect(lib?.output?.distPath).toEqual({ root: "dist/npm" });
			});

			it("should not pass dtsPathPrefix to DtsPlugin for single format", async () => {
				const options = NodeLibraryBuilder.mergeOptions({ format: "esm" });
				await NodeLibraryBuilder.createSingleMode("npm", options);

				const dtsCalls = vi.mocked(DtsPlugin).mock.calls;
				expect(dtsCalls[0][0]).not.toHaveProperty("dtsPathPrefix");
			});

			it("should pass formatDirs with all formats to primary FilesArrayPlugin", async () => {
				const options = NodeLibraryBuilder.mergeOptions({ format: ["esm", "cjs"] });
				await NodeLibraryBuilder.createSingleMode("npm", options);

				// Primary FilesArrayPlugin is the first call
				const filesCalls = vi.mocked(FilesArrayPlugin).mock.calls;
				const primaryCall = filesCalls[0][0];
				expect(primaryCall).toMatchObject({ formatDirs: ["esm", "cjs"] });
			});

			it("should not pass formatDirs for single format", async () => {
				const options = NodeLibraryBuilder.mergeOptions({ format: "esm" });
				await NodeLibraryBuilder.createSingleMode("npm", options);

				const filesCalls = vi.mocked(FilesArrayPlugin).mock.calls;
				expect(filesCalls[0][0]).not.toHaveProperty("formatDirs");
			});
		});

		describe("cjsInterop", () => {
			it("should default cjsInterop to false", () => {
				vi.mocked(existsSync).mockReturnValue(false);

				const result = NodeLibraryBuilder.mergeOptions();

				expect(result.cjsInterop).toBe(false);
			});

			it("should add footer to CJS primary lib when cjsInterop is true", async () => {
				const options = NodeLibraryBuilder.mergeOptions({ format: "cjs", cjsInterop: true });
				await NodeLibraryBuilder.createSingleMode("npm", options);

				const lib = capturedConfig?.lib?.[0];
				expect(lib?.footer).toBeDefined();
				expect(lib?.footer).toHaveProperty("js");
				expect((lib?.footer as { js: string }).js).toContain("module.exports = _def");
			});

			it("should add footer to CJS secondary lib in dual format when cjsInterop is true", async () => {
				const options = NodeLibraryBuilder.mergeOptions({ format: ["esm", "cjs"], cjsInterop: true });
				await NodeLibraryBuilder.createSingleMode("npm", options);

				// Primary lib (ESM) should NOT have footer
				const primaryLib = capturedConfig?.lib?.[0];
				expect(primaryLib?.footer).toBeUndefined();

				// Secondary lib (CJS) should have footer
				const secondaryLib = capturedConfig?.lib?.[1];
				expect(secondaryLib?.footer).toBeDefined();
				expect((secondaryLib?.footer as { js: string }).js).toContain("module.exports = _def");
			});

			it("should not add footer to ESM lib when cjsInterop is true", async () => {
				const options = NodeLibraryBuilder.mergeOptions({ format: "esm", cjsInterop: true });
				await NodeLibraryBuilder.createSingleMode("npm", options);

				const lib = capturedConfig?.lib?.[0];
				expect(lib?.footer).toBeUndefined();
			});

			it("should not add footer when cjsInterop is false", async () => {
				const options = NodeLibraryBuilder.mergeOptions({ format: "cjs", cjsInterop: false });
				await NodeLibraryBuilder.createSingleMode("npm", options);

				const lib = capturedConfig?.lib?.[0];
				expect(lib?.footer).toBeUndefined();
			});
		});

		describe("publish targets", () => {
			it("should not pass transform to PackageJsonTransformPlugin when targets exist", async () => {
				const mockPkgWithTargets = JSON.stringify({
					name: "test-pkg",
					version: "1.0.0",
					exports: { ".": "./src/index.ts" },
					publishConfig: {
						access: "public",
						targets: ["npm", "github"],
					},
				});
				vi.mocked(readFileSync).mockReturnValue(mockPkgWithTargets);

				const userTransform = vi.fn(((ctx) => ctx.pkg) as import("./node-library-builder.js").TransformPackageJsonFn);
				const options = NodeLibraryBuilder.mergeOptions({
					transform: userTransform,
				});
				await NodeLibraryBuilder.createSingleMode("npm", options);

				// When targets exist, transform should NOT be passed to PackageJsonTransformPlugin
				// (PublishTargetPlugin handles per-target transforms instead)
				const pkgTransformCall = vi.mocked(PackageJsonTransformPlugin).mock.calls[0][0];
				expect(pkgTransformCall?.transform).toBeUndefined();
			});

			it("should pass undefined target in dev mode", async () => {
				const mockPkgWithTargets = JSON.stringify({
					name: "test-pkg",
					version: "1.0.0",
					exports: { ".": "./src/index.ts" },
					publishConfig: {
						access: "public",
						targets: ["npm", "github"],
					},
				});
				vi.mocked(readFileSync).mockReturnValue(mockPkgWithTargets);

				const userTransform = vi.fn(((ctx) => ctx.pkg) as import("./node-library-builder.js").TransformPackageJsonFn);
				const options = NodeLibraryBuilder.mergeOptions({
					transform: userTransform,
				});
				await NodeLibraryBuilder.createSingleMode("dev", options);

				// The transform wrapper should pass undefined target for dev mode
				const pkgTransformCall = vi.mocked(PackageJsonTransformPlugin).mock.calls[0][0];
				// biome-ignore lint/suspicious/noExplicitAny: Test mock
				const wrappedFn = pkgTransformCall?.transform as any;
				const fakePkg = { name: "test" };
				wrappedFn(fakePkg);

				expect(userTransform).toHaveBeenCalledWith(
					expect.objectContaining({
						mode: "dev",
						target: undefined,
					}),
				);
			});

			it("should register PublishTargetPlugin for all targets", async () => {
				const mockPkgWithTargets = JSON.stringify({
					name: "test-pkg",
					version: "1.0.0",
					exports: { ".": "./src/index.ts" },
					publishConfig: {
						access: "public",
						targets: ["npm", "github"],
					},
				});
				vi.mocked(readFileSync).mockReturnValue(mockPkgWithTargets);

				const options = NodeLibraryBuilder.mergeOptions();
				await NodeLibraryBuilder.createSingleMode("npm", options);

				expect(PublishTargetPlugin).toHaveBeenCalledWith(
					expect.objectContaining({
						targets: expect.arrayContaining([
							expect.objectContaining({
								protocol: "npm",
								registry: "https://registry.npmjs.org/",
							}),
							expect.objectContaining({
								protocol: "npm",
								registry: "https://npm.pkg.github.com/",
							}),
						]),
						mode: "npm",
					}),
				);
			});

			it("should register PublishTargetPlugin for single target", async () => {
				const mockPkgWithSingleTarget = JSON.stringify({
					name: "test-pkg",
					version: "1.0.0",
					exports: { ".": "./src/index.ts" },
					publishConfig: {
						access: "public",
						targets: ["npm"],
					},
				});
				vi.mocked(readFileSync).mockReturnValue(mockPkgWithSingleTarget);

				const options = NodeLibraryBuilder.mergeOptions();
				await NodeLibraryBuilder.createSingleMode("npm", options);

				expect(PublishTargetPlugin).toHaveBeenCalledWith(
					expect.objectContaining({
						targets: [
							expect.objectContaining({
								protocol: "npm",
								registry: "https://registry.npmjs.org/",
							}),
						],
						mode: "npm",
					}),
				);
			});

			it("should not register PublishTargetPlugin for dev mode", async () => {
				const mockPkgWithTargets = JSON.stringify({
					name: "test-pkg",
					version: "1.0.0",
					exports: { ".": "./src/index.ts" },
					publishConfig: {
						access: "public",
						targets: ["npm", "github"],
					},
				});
				vi.mocked(readFileSync).mockReturnValue(mockPkgWithTargets);

				const options = NodeLibraryBuilder.mergeOptions();
				await NodeLibraryBuilder.createSingleMode("dev", options);

				expect(PublishTargetPlugin).not.toHaveBeenCalled();
			});

			it("should not pass target to FilesArrayPlugin", async () => {
				const mockPkgWithTargets = JSON.stringify({
					name: "test-pkg",
					version: "1.0.0",
					exports: { ".": "./src/index.ts" },
					publishConfig: {
						access: "public",
						targets: ["npm"],
					},
				});
				vi.mocked(readFileSync).mockReturnValue(mockPkgWithTargets);

				const options = NodeLibraryBuilder.mergeOptions();
				await NodeLibraryBuilder.createSingleMode("npm", options);

				const filesArrayCall = vi.mocked(FilesArrayPlugin).mock.calls[0][0];
				expect(filesArrayCall).not.toHaveProperty("target");
			});
		});
	});
});
