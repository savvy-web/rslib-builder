import { existsSync, readFileSync } from "node:fs";
import type { ConfigParams, RslibConfig } from "@rslib/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RSPressPluginBuilder } from "./rspress-plugin-builder.js";

/** Helper to create ConfigParams with the required fields. */
function envParams(envMode?: string): ConfigParams {
	return { env: "test", command: "build", envMode } as ConfigParams;
}

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
		resolve: vi.fn((...args: string[]) => args.join("/")),
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

// Mock pluginReact
const mockPluginReact = vi.fn(() => ({ name: "plugin-react" }));
vi.mock("@rsbuild/plugin-react", () => ({
	pluginReact: mockPluginReact,
}));

// Mock plugins to return identifiable objects
vi.mock("../plugins/dts-plugin.js", () => ({
	DtsPlugin: vi.fn((opts: unknown) => ({ name: "dts-plugin", _opts: opts })),
}));
vi.mock("../plugins/files-array-plugin.js", () => ({
	FilesArrayPlugin: vi.fn((opts: unknown) => ({ name: "files-array-plugin", _opts: opts })),
}));
vi.mock("../plugins/package-json-transform-plugin.js", () => ({
	PackageJsonTransformPlugin: vi.fn((opts: unknown) => ({ name: "package-json-transform-plugin", _opts: opts })),
}));
vi.mock("../plugins/tsdoc-lint-plugin.js", () => ({
	TsDocLintPlugin: vi.fn((opts: unknown) => ({ name: "tsdoc-lint-plugin", _opts: opts })),
}));
vi.mock("../plugins/publish-target-plugin.js", () => ({
	PublishTargetPlugin: vi.fn((opts: unknown) => ({ name: "publish-target-plugin", _opts: opts })),
}));

// Mock resolvePublishTargets
vi.mock("./node-library-builder.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./node-library-builder.js")>();
	return {
		...actual,
		resolvePublishTargets: vi.fn(() => []),
	};
});

// Import mocked plugins to inspect calls
import { DtsPlugin } from "../plugins/dts-plugin.js";
import { PackageJsonTransformPlugin } from "../plugins/package-json-transform-plugin.js";
import { PublishTargetPlugin } from "../plugins/publish-target-plugin.js";
import { TsDocLintPlugin } from "../plugins/tsdoc-lint-plugin.js";
import { resolvePublishTargets } from "./node-library-builder.js";

const mockPackageJson = JSON.stringify({
	name: "rspress-plugin-test",
	version: "1.0.0",
	exports: { ".": "./src/index.ts" },
});

describe("RSPressPluginBuilder", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		capturedConfig = undefined;
		vi.mocked(readFileSync).mockReturnValue(mockPackageJson);
		// Default: runtime file does not exist
		vi.mocked(existsSync).mockReturnValue(false);
	});

	describe("create()", () => {
		it("should return an async function", () => {
			const configFn = RSPressPluginBuilder.create();
			expect(typeof configFn).toBe("function");
		});

		it("should reject invalid envMode", async () => {
			const configFn = RSPressPluginBuilder.create();
			await expect(configFn(envParams("invalid"))).rejects.toThrow('Invalid env-mode: "invalid"');
		});

		it("should accept dev envMode", async () => {
			const configFn = RSPressPluginBuilder.create();
			await expect(configFn(envParams("dev"))).resolves.toBeDefined();
		});

		it("should accept npm envMode", async () => {
			const configFn = RSPressPluginBuilder.create();
			await expect(configFn(envParams("npm"))).resolves.toBeDefined();
		});

		it("should default to dev mode when envMode is undefined", async () => {
			const configFn = RSPressPluginBuilder.create();
			await configFn(envParams(undefined));

			const pluginLib = capturedConfig?.lib?.[0];
			expect(pluginLib?.output?.distPath).toEqual(expect.objectContaining({ root: "dist/dev" }));
		});
	});

	describe("plugin lib entry", () => {
		it("should always generate plugin entry with default path", async () => {
			const configFn = RSPressPluginBuilder.create();
			await configFn(envParams("dev"));

			const pluginLib = capturedConfig?.lib?.[0];
			expect(pluginLib).toBeDefined();
			expect(pluginLib?.source?.entry).toEqual({ index: "./src/index.ts" });
		});

		it("should use custom plugin entry when provided", async () => {
			const configFn = RSPressPluginBuilder.create({
				plugin: { entry: "./src/plugin.ts" },
			});
			await configFn(envParams("dev"));

			const pluginLib = capturedConfig?.lib?.[0];
			expect(pluginLib?.source?.entry).toEqual({ index: "./src/plugin.ts" });
		});

		it("should merge user externals with RSPRESS_PLUGIN_EXTERNALS", async () => {
			const configFn = RSPressPluginBuilder.create({
				plugin: { externals: ["some-dep"] },
			});
			await configFn(envParams("dev"));

			const pluginLib = capturedConfig?.lib?.[0];
			expect(pluginLib?.output?.externals).toEqual(expect.arrayContaining(["@rspress/core", "some-dep"]));
		});

		it("should set import.meta.env define", async () => {
			const configFn = RSPressPluginBuilder.create();
			await configFn(envParams("dev"));

			const pluginLib = capturedConfig?.lib?.[0];
			expect(pluginLib?.source?.define).toEqual(expect.objectContaining({ "import.meta.env": "import.meta.env" }));
		});

		it("should merge user define with default define", async () => {
			const configFn = RSPressPluginBuilder.create({
				plugin: { define: { MY_VAR: '"hello"' } },
			});
			await configFn(envParams("dev"));

			const pluginLib = capturedConfig?.lib?.[0];
			expect(pluginLib?.source?.define).toEqual(
				expect.objectContaining({
					"import.meta.env": "import.meta.env",
					MY_VAR: '"hello"',
				}),
			);
		});

		it("should place PackageJsonTransformPlugin on plugin lib only", async () => {
			// Enable runtime
			vi.mocked(existsSync).mockReturnValue(true);

			const configFn = RSPressPluginBuilder.create();
			await configFn(envParams("dev"));

			expect(PackageJsonTransformPlugin).toHaveBeenCalledTimes(1);

			// Plugin lib should have it
			const pluginLib = capturedConfig?.lib?.[0];
			const pluginPlugins = pluginLib?.plugins ?? [];
			expect(pluginPlugins).toEqual(
				expect.arrayContaining([expect.objectContaining({ name: "package-json-transform-plugin" })]),
			);

			// Runtime lib should NOT have it
			const runtimeLib = capturedConfig?.lib?.[1];
			const runtimePlugins = runtimeLib?.plugins ?? [];
			expect(runtimePlugins).not.toEqual(
				expect.arrayContaining([expect.objectContaining({ name: "package-json-transform-plugin" })]),
			);
		});

		it("should set format to esm and bundle to true", async () => {
			const configFn = RSPressPluginBuilder.create();
			await configFn(envParams("dev"));

			const pluginLib = capturedConfig?.lib?.[0];
			expect(pluginLib?.format).toBe("esm");
			expect(pluginLib?.bundle).toBe(true);
		});

		it("should set advancedEsm experiment", async () => {
			const configFn = RSPressPluginBuilder.create();
			await configFn(envParams("dev"));

			const pluginLib = capturedConfig?.lib?.[0];
			expect(pluginLib?.experiments).toEqual({ advancedEsm: true });
		});
	});

	describe("runtime lib entry", () => {
		it("should auto-detect when src/runtime/index.tsx exists", async () => {
			vi.mocked(existsSync).mockReturnValue(true);

			const configFn = RSPressPluginBuilder.create();
			await configFn(envParams("dev"));

			expect(capturedConfig?.lib).toHaveLength(2);
			const runtimeLib = capturedConfig?.lib?.[1];
			expect(runtimeLib).toBeDefined();
			expect(runtimeLib?.source?.entry).toEqual({ index: "./src/runtime/index.tsx" });
		});

		it("should skip when file does not exist", async () => {
			vi.mocked(existsSync).mockReturnValue(false);

			const configFn = RSPressPluginBuilder.create();
			await configFn(envParams("dev"));

			expect(capturedConfig?.lib).toHaveLength(1);
		});

		it("should skip when runtime: false even if file exists", async () => {
			vi.mocked(existsSync).mockReturnValue(true);

			const configFn = RSPressPluginBuilder.create({ runtime: false });
			await configFn(envParams("dev"));

			expect(capturedConfig?.lib).toHaveLength(1);
		});

		it("should include pluginReact on runtime lib only", async () => {
			vi.mocked(existsSync).mockReturnValue(true);

			const configFn = RSPressPluginBuilder.create();
			await configFn(envParams("dev"));

			// Runtime lib should have pluginReact
			const runtimeLib = capturedConfig?.lib?.[1];
			const runtimePlugins = runtimeLib?.plugins ?? [];
			expect(runtimePlugins).toEqual(expect.arrayContaining([expect.objectContaining({ name: "plugin-react" })]));

			// Plugin lib should NOT have pluginReact
			const pluginLib = capturedConfig?.lib?.[0];
			const pluginPlugins = pluginLib?.plugins ?? [];
			expect(pluginPlugins).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: "plugin-react" })]));
		});

		it("should merge user externals with RSPRESS_RUNTIME_EXTERNALS", async () => {
			vi.mocked(existsSync).mockReturnValue(true);

			const configFn = RSPressPluginBuilder.create({
				runtime: { externals: ["custom-dep"] },
			});
			await configFn(envParams("dev"));

			const runtimeLib = capturedConfig?.lib?.[1];
			expect(runtimeLib?.output?.externals).toEqual(
				expect.arrayContaining([
					"react",
					"react/jsx-runtime",
					"react/jsx-dev-runtime",
					"@rspress/core",
					"@theme",
					"custom-dep",
				]),
			);
		});

		it("should configure CSS modules on runtime lib", async () => {
			vi.mocked(existsSync).mockReturnValue(true);

			const configFn = RSPressPluginBuilder.create();
			await configFn(envParams("dev"));

			const runtimeLib = capturedConfig?.lib?.[1];
			expect(runtimeLib?.output?.cssModules).toEqual({
				namedExport: false,
				exportLocalsConvention: "camelCaseOnly",
			});
		});

		it("should set runtime distPath under mode/runtime/", async () => {
			vi.mocked(existsSync).mockReturnValue(true);

			const configFn = RSPressPluginBuilder.create();
			await configFn(envParams("dev"));

			const runtimeLib = capturedConfig?.lib?.[1];
			expect(runtimeLib?.output?.distPath).toEqual(expect.objectContaining({ root: "dist/dev/runtime" }));
		});

		it("should use custom runtime entry when provided", async () => {
			const configFn = RSPressPluginBuilder.create({
				runtime: { entry: "./src/runtime/custom.tsx" },
			});
			await configFn(envParams("dev"));

			expect(capturedConfig?.lib).toHaveLength(2);
			const runtimeLib = capturedConfig?.lib?.[1];
			expect(runtimeLib?.source?.entry).toEqual({ index: "./src/runtime/custom.tsx" });
		});
	});

	describe("mode handling", () => {
		it("should enable source maps in dev mode", async () => {
			const configFn = RSPressPluginBuilder.create();
			await configFn(envParams("dev"));

			const pluginLib = capturedConfig?.lib?.[0];
			expect(pluginLib?.output?.sourceMap).toBe(true);
		});

		it("should disable source maps in npm mode", async () => {
			const configFn = RSPressPluginBuilder.create();
			await configFn(envParams("npm"));

			const pluginLib = capturedConfig?.lib?.[0];
			expect(pluginLib?.output?.sourceMap).toBe(false);
		});

		it("should add PublishTargetPlugin only in npm mode when targets exist", async () => {
			vi.mocked(resolvePublishTargets).mockReturnValue([
				{
					protocol: "npm",
					registry: "https://registry.npmjs.org/",
					directory: "/test/dist/npm/npm",
					access: "public",
					provenance: false,
					tag: "latest",
				},
			]);

			const configFn = RSPressPluginBuilder.create();
			await configFn(envParams("npm"));

			expect(PublishTargetPlugin).toHaveBeenCalledTimes(1);
		});

		it("should not add PublishTargetPlugin in dev mode", async () => {
			vi.mocked(resolvePublishTargets).mockReturnValue([
				{
					protocol: "npm",
					registry: "https://registry.npmjs.org/",
					directory: "/test/dist/npm/npm",
					access: "public",
					provenance: false,
					tag: "latest",
				},
			]);

			const configFn = RSPressPluginBuilder.create();
			await configFn(envParams("dev"));

			expect(PublishTargetPlugin).not.toHaveBeenCalled();
		});

		it("should not add PublishTargetPlugin in npm mode when no targets", async () => {
			vi.mocked(resolvePublishTargets).mockReturnValue([]);

			const configFn = RSPressPluginBuilder.create();
			await configFn(envParams("npm"));

			expect(PublishTargetPlugin).not.toHaveBeenCalled();
		});
	});

	describe("DTS options", () => {
		it("should pass tsconfigPreset to DtsPlugin when no tsconfigPath", async () => {
			const configFn = RSPressPluginBuilder.create();
			await configFn(envParams("dev"));

			const dtsCall = vi.mocked(DtsPlugin).mock.calls[0][0];
			expect(dtsCall).toHaveProperty("tsconfigPreset");
			expect(dtsCall).not.toHaveProperty("tsconfigPath");
		});

		it("should pass tsconfigPath when provided", async () => {
			const configFn = RSPressPluginBuilder.create({
				tsconfigPath: "./tsconfig.custom.json",
			});
			await configFn(envParams("dev"));

			const dtsCall = vi.mocked(DtsPlugin).mock.calls[0][0];
			expect(dtsCall).toHaveProperty("tsconfigPath", "./tsconfig.custom.json");
			expect(dtsCall).not.toHaveProperty("tsconfigPreset");
		});

		it("should pass apiModel to DtsPlugin", async () => {
			const configFn = RSPressPluginBuilder.create({
				apiModel: { tsdocMetadata: false },
			});
			await configFn(envParams("dev"));

			const dtsCall = vi.mocked(DtsPlugin).mock.calls[0][0];
			expect(dtsCall).toHaveProperty("apiModel", { tsdocMetadata: false });
		});

		it("should pass dtsBundledPackages", async () => {
			const configFn = RSPressPluginBuilder.create({
				dtsBundledPackages: ["some-pkg"],
			});
			await configFn(envParams("dev"));

			const dtsCall = vi.mocked(DtsPlugin).mock.calls[0][0];
			expect(dtsCall).toHaveProperty("bundledPackages", ["some-pkg"]);
		});

		it("should pass apiModel: false to runtime DtsPlugin", async () => {
			vi.mocked(existsSync).mockReturnValue(true);

			const configFn = RSPressPluginBuilder.create();
			await configFn(envParams("dev"));

			// First call is plugin lib DtsPlugin, second is runtime DtsPlugin
			const runtimeDtsCall = vi.mocked(DtsPlugin).mock.calls[1][0];
			expect(runtimeDtsCall).toHaveProperty("apiModel", false);
			expect(runtimeDtsCall).not.toHaveProperty("dtsPathPrefix");
		});
	});

	describe("TsDocLintPlugin", () => {
		it("should add TsDocLintPlugin when apiModel is enabled (default)", async () => {
			const configFn = RSPressPluginBuilder.create();
			await configFn(envParams("dev"));

			expect(TsDocLintPlugin).toHaveBeenCalledTimes(1);
		});

		it("should not add TsDocLintPlugin when apiModel is false", async () => {
			const configFn = RSPressPluginBuilder.create({ apiModel: false });
			await configFn(envParams("dev"));

			expect(TsDocLintPlugin).not.toHaveBeenCalled();
		});
	});

	describe("plugin ordering", () => {
		it("should place plugins in correct order on plugin lib", async () => {
			const configFn = RSPressPluginBuilder.create();
			await configFn(envParams("dev"));

			const pluginLib = capturedConfig?.lib?.[0];
			const pluginNames = (pluginLib?.plugins ?? []).map((p) => (p as { name: string }).name);

			// TsDocLintPlugin, PackageJsonTransformPlugin, FilesArrayPlugin, DtsPlugin
			expect(pluginNames).toEqual([
				"tsdoc-lint-plugin",
				"package-json-transform-plugin",
				"files-array-plugin",
				"dts-plugin",
			]);
		});

		it("should include user plugins after DtsPlugin", async () => {
			const userPlugin = { name: "user-plugin", setup: vi.fn() };
			const configFn = RSPressPluginBuilder.create({
				plugin: { plugins: [userPlugin] },
			});
			await configFn(envParams("dev"));

			const pluginLib = capturedConfig?.lib?.[0];
			const pluginNames = (pluginLib?.plugins ?? []).map((p) => (p as { name: string }).name);

			expect(pluginNames).toEqual([
				"tsdoc-lint-plugin",
				"package-json-transform-plugin",
				"files-array-plugin",
				"dts-plugin",
				"user-plugin",
			]);
		});
	});

	describe("copyPatterns", () => {
		it("should pass copyPatterns to plugin lib output", async () => {
			const configFn = RSPressPluginBuilder.create({
				copyPatterns: [{ from: "./i18n", to: "./i18n" }],
			});
			await configFn(envParams("dev"));

			const pluginLib = capturedConfig?.lib?.[0];
			expect(pluginLib?.output?.copy).toEqual({
				patterns: [{ from: "./i18n", to: "./i18n" }],
			});
		});
	});

	describe("transform", () => {
		it("should wrap user transform for PackageJsonTransformPlugin when no targets", async () => {
			const userTransform = vi.fn(((ctx) => ctx.pkg) as import("./node-library-builder.js").TransformPackageJsonFn);

			const configFn = RSPressPluginBuilder.create({
				transform: userTransform,
			});
			await configFn(envParams("dev"));

			const pkgTransformCall = vi.mocked(PackageJsonTransformPlugin).mock.calls[0][0];
			expect(pkgTransformCall?.transform).toBeDefined();
		});

		it("should not pass transform to PackageJsonTransformPlugin when targets exist", async () => {
			vi.mocked(resolvePublishTargets).mockReturnValue([
				{
					protocol: "npm",
					registry: "https://registry.npmjs.org/",
					directory: "/test/dist/npm/npm",
					access: "public",
					provenance: false,
					tag: "latest",
				},
			]);

			const userTransform = vi.fn(((ctx) => ctx.pkg) as import("./node-library-builder.js").TransformPackageJsonFn);

			const configFn = RSPressPluginBuilder.create({
				transform: userTransform,
			});
			await configFn(envParams("npm"));

			const pkgTransformCall = vi.mocked(PackageJsonTransformPlugin).mock.calls[0][0];
			expect(pkgTransformCall?.transform).toBeUndefined();
		});
	});

	describe("runtime tools.rspack banner", () => {
		it("should configure tools.rspack on runtime lib for CSS banner", async () => {
			vi.mocked(existsSync).mockReturnValue(true);

			const configFn = RSPressPluginBuilder.create();
			await configFn(envParams("dev"));

			const runtimeLib = capturedConfig?.lib?.[1];
			expect(runtimeLib?.tools?.rspack).toBeDefined();
		});
	});
});
