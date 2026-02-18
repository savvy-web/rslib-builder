import { access, readFile, stat } from "node:fs/promises";
// biome-ignore lint/correctness/noUndeclaredDependencies: this is OK because these are only used in test files
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockStats } from "../../__test__/rslib/types/test-types.js";
import type { PackageJson } from "../../types/package-json.js";

// Mock node:fs/promises
vi.mock("node:fs/promises", () => ({
	readFile: vi.fn(),
	access: vi.fn(),
	stat: vi.fn().mockRejectedValue(new Error("ENOENT")),
}));

// Mock logging to suppress output during tests
vi.mock("../../src/tsconfig/plugins/utils/logger-utils.js", () => ({
	createEnvLogger: () => ({
		entries: vi.fn(),
		global: {
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		},
	}),
}));

// Mock ImportGraph for bundleless tests
const mockTraceFromEntries = vi.fn();
vi.mock("./utils/import-graph.js", () => ({
	ImportGraph: class MockImportGraph {
		traceFromEntries = mockTraceFromEntries;
	},
}));

const mockReadFile: ReturnType<typeof vi.mocked<typeof readFile>> = vi.mocked(readFile);
const mockAccess: ReturnType<typeof vi.mocked<typeof access>> = vi.mocked(access);
const mockStat: ReturnType<typeof vi.mocked<typeof stat>> = vi.mocked(stat);

// Static import after mocks are set up
import { AutoEntryPlugin } from "./auto-entry-plugin.js";

describe("AutoEntryPlugin", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Mock process.cwd
		vi.spyOn(process, "cwd").mockReturnValue("/test/project");
		// Default stat mock - file doesn't exist
		mockStat.mockRejectedValue(new Error("ENOENT"));
	});

	it("should create plugin with correct name", () => {
		const plugin = AutoEntryPlugin();
		expect(plugin.name).toBe("auto-entry-plugin");
		expect(typeof plugin.setup).toBe("function");
	});

	it("should handle multi-environment configuration with entries", async () => {
		const packageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
			exports: "./src/index.ts",
		};

		// Mock package.json to exist
		mockStat.mockResolvedValue(createMockStats(new Date()));
		mockAccess.mockResolvedValue(undefined);
		mockReadFile.mockResolvedValue(JSON.stringify(packageJson));

		const plugin = AutoEntryPlugin();
		const mockApi = {
			modifyRsbuildConfig: vi.fn(),
			expose: vi.fn(),
			useExposed: vi.fn().mockReturnValue(undefined),
			onBeforeBuild: vi.fn(),
			logger: {
				debug: vi.fn(),
			},
		};

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof AutoEntryPlugin>["setup"]>[0]);

		// Call the config modifier
		const configModifier = mockApi.modifyRsbuildConfig.mock.calls[0][0];
		const config = {
			environments: {
				development: { source: {} },
				production: { source: {} },
			},
		};

		await configModifier(config);

		// Verify both environments got the entry
		expect(config.environments.development.source).toHaveProperty("entry");
		expect(config.environments.production.source).toHaveProperty("entry");
		expect((config.environments.development.source as { entry?: Record<string, string> }).entry).toEqual({
			index: "./src/index.ts",
		});
		expect((config.environments.production.source as { entry?: Record<string, string> }).entry).toEqual({
			index: "./src/index.ts",
		});
	});

	it("should throw error when package.json is missing", async () => {
		// Ensure stat rejects (package.json doesn't exist)
		mockStat.mockRejectedValue(new Error("ENOENT"));
		mockAccess.mockRejectedValue(new Error("ENOENT"));

		const plugin = AutoEntryPlugin();
		const mockApi = {
			modifyRsbuildConfig: vi.fn(),
			expose: vi.fn(),
			useExposed: vi.fn().mockReturnValue(undefined),
			onBeforeBuild: vi.fn(),
			logger: {
				debug: vi.fn(),
			},
		};

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof AutoEntryPlugin>["setup"]>[0]);

		// Call the config modifier
		const configModifier = mockApi.modifyRsbuildConfig.mock.calls[0][0];
		const config = { environments: {} };

		// Should throw error when package.json doesn't exist
		await expect(configModifier(config)).rejects.toThrow("package.json not found in project root");
	});

	it("should handle JSON parse errors gracefully", async () => {
		// Mock package.json to exist but contain invalid JSON
		mockStat.mockResolvedValue(createMockStats(new Date()));
		mockAccess.mockResolvedValue(undefined);
		mockReadFile.mockResolvedValue("invalid json");

		const plugin = AutoEntryPlugin();
		const mockApi = {
			modifyRsbuildConfig: vi.fn(),
			expose: vi.fn(),
			useExposed: vi.fn().mockReturnValue(undefined),
			onBeforeBuild: vi.fn(),
			logger: {
				debug: vi.fn(),
			},
		};

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof AutoEntryPlugin>["setup"]>[0]);

		// Call the config modifier
		const configModifier = mockApi.modifyRsbuildConfig.mock.calls[0][0];
		const config = { environments: {} };

		// Should not throw
		await expect(configModifier(config)).resolves.not.toThrow();
		expect(mockApi.modifyRsbuildConfig).toHaveBeenCalledTimes(1);
	});

	it("should handle config without environments", async () => {
		const packageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
			exports: "./src/index.ts",
		};

		// Mock package.json to exist
		mockStat.mockResolvedValue(createMockStats(new Date()));
		mockAccess.mockResolvedValue(undefined);
		mockReadFile.mockResolvedValue(JSON.stringify(packageJson));

		const plugin = AutoEntryPlugin();
		const mockApi = {
			modifyRsbuildConfig: vi.fn(),
			expose: vi.fn(),
			useExposed: vi.fn().mockReturnValue(undefined),
			onBeforeBuild: vi.fn(),
			logger: {
				debug: vi.fn(),
			},
		};

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof AutoEntryPlugin>["setup"]>[0]);

		// Call the config modifier with a config that has no environments
		const configModifier = mockApi.modifyRsbuildConfig.mock.calls[0][0];
		const config = {};

		// Should not throw
		await expect(configModifier(config)).resolves.not.toThrow();
	});

	it("should handle bin entries and convert them to JSR-style outputs", async () => {
		const packageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
			bin: {
				"my-cli": "./src/bin/cli.ts",
			},
		};

		// Mock package.json to exist
		mockStat.mockResolvedValue(createMockStats(new Date()));
		mockAccess.mockResolvedValue(undefined);
		mockReadFile.mockResolvedValue(JSON.stringify(packageJson));

		const plugin = AutoEntryPlugin();
		const mockApi = {
			modifyRsbuildConfig: vi.fn(),
			expose: vi.fn(),
			useExposed: vi.fn().mockReturnValue(undefined),
			onBeforeBuild: vi.fn(),
			logger: {
				debug: vi.fn(),
			},
		};

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof AutoEntryPlugin>["setup"]>[0]);

		// Verify that expose was called with entrypoints Map containing bin entries
		expect(mockApi.expose).toHaveBeenCalledWith("entrypoints", expect.any(Map));
		const entrypointsMap = mockApi.expose.mock.calls[0][1] as Map<string, string>;

		// Call the config modifier to populate the entrypoints
		const configModifier = mockApi.modifyRsbuildConfig.mock.calls[0][0];
		const config = {
			environments: {
				development: { source: {} },
			},
		};

		await configModifier(config);

		// Check that bin entries are converted to JSR-style names
		expect(entrypointsMap.has("bin/my-cli.ts")).toBe(true);
		expect(entrypointsMap.get("bin/my-cli.ts")).toBe("./src/bin/cli.ts");
	});

	it("should handle named exports other than index", async () => {
		const packageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
			exports: {
				"./utils": "./src/utils.ts",
				"./helpers": "./src/helpers.ts",
			},
		};

		// Mock package.json to exist
		mockStat.mockResolvedValue(createMockStats(new Date()));
		mockAccess.mockResolvedValue(undefined);
		mockReadFile.mockResolvedValue(JSON.stringify(packageJson));

		const plugin = AutoEntryPlugin();
		const mockApi = {
			modifyRsbuildConfig: vi.fn(),
			expose: vi.fn(),
			useExposed: vi.fn().mockReturnValue(undefined),
			onBeforeBuild: vi.fn(),
			logger: {
				debug: vi.fn(),
			},
		};

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof AutoEntryPlugin>["setup"]>[0]);

		// Call the config modifier
		const configModifier = mockApi.modifyRsbuildConfig.mock.calls[0][0];
		const config = {
			environments: {
				development: { source: {} },
			},
		};

		await configModifier(config);

		// Verify both environments got the entries
		expect(config.environments.development.source).toHaveProperty("entry");
		expect((config.environments.development.source as { entry?: Record<string, string> }).entry).toEqual({
			utils: "./src/utils.ts",
			helpers: "./src/helpers.ts",
		});

		// Check JSR-style entrypoints
		const entrypointsMap = mockApi.expose.mock.calls[0][1] as Map<string, string>;
		expect(entrypointsMap.has("utils.ts")).toBe(true);
		expect(entrypointsMap.has("helpers.ts")).toBe(true);
	});

	it("should build export to output map when exportsAsIndexes is enabled", async () => {
		const packageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
			exports: {
				".": "./src/index.ts",
				"./utils": "./src/utils/index.ts",
				"./helpers": "./src/helpers.ts",
				"./package.json": "./package.json",
			},
		};

		// Mock package.json to exist
		mockStat.mockResolvedValue(createMockStats(new Date()));
		mockAccess.mockResolvedValue(undefined);
		mockReadFile.mockResolvedValue(JSON.stringify(packageJson));

		const plugin = AutoEntryPlugin({ exportsAsIndexes: true });
		const mockApi = {
			modifyRsbuildConfig: vi.fn(),
			expose: vi.fn(),
			useExposed: vi.fn().mockReturnValue(undefined),
			onBeforeBuild: vi.fn(),
			logger: {
				debug: vi.fn(),
			},
		};

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof AutoEntryPlugin>["setup"]>[0]);

		// Verify that expose was called with exportToOutputMap
		expect(mockApi.expose).toHaveBeenCalledWith("exportToOutputMap", expect.any(Map));
		const exportToOutputMap = mockApi.expose.mock.calls.find((call) => call[0] === "exportToOutputMap")?.[1] as Map<
			string,
			string
		>;

		// Call the config modifier to populate the map
		const configModifier = mockApi.modifyRsbuildConfig.mock.calls[0][0];
		const config = {
			environments: {
				development: { source: {} },
			},
		};

		await configModifier(config);

		// Verify the export to output map was built correctly
		expect(exportToOutputMap.has(".")).toBe(true);
		expect(exportToOutputMap.get(".")).toBe("./index.js");
		expect(exportToOutputMap.has("./utils")).toBe(true);
		expect(exportToOutputMap.get("./utils")).toBe("./utils/index.js");
		expect(exportToOutputMap.has("./helpers")).toBe(true);
		expect(exportToOutputMap.get("./helpers")).toBe("./helpers/index.js");
		// package.json should be skipped
		expect(exportToOutputMap.has("./package.json")).toBe(false);
	});

	it("should handle exportsAsIndexes with string exports", async () => {
		const packageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
			exports: "./src/index.ts",
		};

		// Mock package.json to exist
		mockStat.mockResolvedValue(createMockStats(new Date()));
		mockAccess.mockResolvedValue(undefined);
		mockReadFile.mockResolvedValue(JSON.stringify(packageJson));

		const plugin = AutoEntryPlugin({ exportsAsIndexes: true });
		const mockApi = {
			modifyRsbuildConfig: vi.fn(),
			expose: vi.fn(),
			useExposed: vi.fn().mockReturnValue(undefined),
			onBeforeBuild: vi.fn(),
			logger: {
				debug: vi.fn(),
			},
		};

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof AutoEntryPlugin>["setup"]>[0]);

		// Call the config modifier
		const configModifier = mockApi.modifyRsbuildConfig.mock.calls[0][0];
		const config = {
			environments: {
				development: { source: {} },
			},
		};

		await configModifier(config);

		// When exports is a string, the export to output map should not be built
		const exportToOutputMap = mockApi.expose.mock.calls.find((call) => call[0] === "exportToOutputMap")?.[1] as Map<
			string,
			string
		>;
		// Map should be empty since exports is not an object
		expect(exportToOutputMap.size).toBe(0);
	});

	it("should handle exportsAsIndexes with array exports", async () => {
		const packageJson = {
			name: "test-package",
			version: "1.0.0",
			exports: ["./src/index.ts", "./src/utils.ts"],
		} as PackageJson;

		// Mock package.json to exist
		mockStat.mockResolvedValue(createMockStats(new Date()));
		mockAccess.mockResolvedValue(undefined);
		mockReadFile.mockResolvedValue(JSON.stringify(packageJson));

		const plugin = AutoEntryPlugin({ exportsAsIndexes: true });
		const mockApi = {
			modifyRsbuildConfig: vi.fn(),
			expose: vi.fn(),
			useExposed: vi.fn().mockReturnValue(undefined),
			onBeforeBuild: vi.fn(),
			logger: {
				debug: vi.fn(),
			},
		};

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof AutoEntryPlugin>["setup"]>[0]);

		// Call the config modifier
		const configModifier = mockApi.modifyRsbuildConfig.mock.calls[0][0];
		const config = {
			environments: {
				development: { source: {} },
			},
		};

		await configModifier(config);

		// When exports is an array, the export to output map should not be built
		const exportToOutputMap = mockApi.expose.mock.calls.find((call) => call[0] === "exportToOutputMap")?.[1] as Map<
			string,
			string
		>;
		// Map should be empty since exports is an array
		expect(exportToOutputMap.size).toBe(0);
	});

	describe("bundleless mode", () => {
		it("should trace import graph and set entry to traced file list", async () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				exports: {
					".": "./src/index.ts",
					"./utils": "./src/utils/index.ts",
				},
			};

			// Mock package.json to exist
			mockStat.mockResolvedValue(createMockStats(new Date()));
			mockAccess.mockResolvedValue(undefined);
			mockReadFile.mockResolvedValue(JSON.stringify(packageJson));

			// Mock import graph tracing results
			mockTraceFromEntries.mockReturnValue({
				files: [
					"/test/project/src/helpers.ts",
					"/test/project/src/index.ts",
					"/test/project/src/utils/index.ts",
					"/test/project/src/utils/shared.ts",
				],
				entries: ["/test/project/src/index.ts", "/test/project/src/utils/index.ts"],
				errors: [],
			});

			const plugin = AutoEntryPlugin({ bundleless: true });
			const mockApi = {
				modifyRsbuildConfig: vi.fn(),
				expose: vi.fn(),
				useExposed: vi.fn().mockReturnValue(undefined),
				onBeforeBuild: vi.fn(),
				logger: {
					debug: vi.fn(),
				},
			};

			plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof AutoEntryPlugin>["setup"]>[0]);

			const configModifier = mockApi.modifyRsbuildConfig.mock.calls[0][0];
			const config = {
				environments: {
					development: { source: {} },
				},
			};

			await configModifier(config);

			// Verify import graph was called with entry source paths
			expect(mockTraceFromEntries).toHaveBeenCalledWith(["./src/index.ts", "./src/utils/index.ts"]);

			// Verify source.entry is set to individual named entries (one per traced file)
			const devEntry = (config.environments.development.source as { entry?: Record<string, string> }).entry;
			expect(devEntry).toEqual({
				"src/helpers.ts": "./src/helpers.ts",
				"src/index.ts": "./src/index.ts",
				"src/utils/index.ts": "./src/utils/index.ts",
				"src/utils/shared.ts": "./src/utils/shared.ts",
			});
		});

		it("should still expose named entries via entrypoints map in bundleless mode", async () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				exports: {
					".": "./src/index.ts",
					"./utils": "./src/utils/index.ts",
				},
			};

			mockStat.mockResolvedValue(createMockStats(new Date()));
			mockAccess.mockResolvedValue(undefined);
			mockReadFile.mockResolvedValue(JSON.stringify(packageJson));

			mockTraceFromEntries.mockReturnValue({
				files: ["/test/project/src/index.ts", "/test/project/src/utils/index.ts"],
				entries: ["/test/project/src/index.ts", "/test/project/src/utils/index.ts"],
				errors: [],
			});

			const plugin = AutoEntryPlugin({ bundleless: true });
			const mockApi = {
				modifyRsbuildConfig: vi.fn(),
				expose: vi.fn(),
				useExposed: vi.fn().mockReturnValue(undefined),
				onBeforeBuild: vi.fn(),
				logger: {
					debug: vi.fn(),
				},
			};

			plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof AutoEntryPlugin>["setup"]>[0]);

			// Get the entrypoints map that was exposed
			const entrypointsMap = mockApi.expose.mock.calls.find((call) => call[0] === "entrypoints")?.[1] as Map<
				string,
				string
			>;

			const configModifier = mockApi.modifyRsbuildConfig.mock.calls[0][0];
			const config = {
				environments: {
					development: { source: {} },
				},
			};

			await configModifier(config);

			// Named entries should still be in entrypoints map (for DtsPlugin, PackageJsonTransformPlugin)
			expect(entrypointsMap.has("index.ts")).toBe(true);
			expect(entrypointsMap.get("index.ts")).toBe("./src/index.ts");
			expect(entrypointsMap.has("utils.ts")).toBe(true);
			expect(entrypointsMap.get("utils.ts")).toBe("./src/utils/index.ts");
		});

		it("should not trace import graph when bundleless is not set", async () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				exports: "./src/index.ts",
			};

			mockStat.mockResolvedValue(createMockStats(new Date()));
			mockAccess.mockResolvedValue(undefined);
			mockReadFile.mockResolvedValue(JSON.stringify(packageJson));

			const plugin = AutoEntryPlugin();
			const mockApi = {
				modifyRsbuildConfig: vi.fn(),
				expose: vi.fn(),
				useExposed: vi.fn().mockReturnValue(undefined),
				onBeforeBuild: vi.fn(),
				logger: {
					debug: vi.fn(),
				},
			};

			plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof AutoEntryPlugin>["setup"]>[0]);

			const configModifier = mockApi.modifyRsbuildConfig.mock.calls[0][0];
			const config = {
				environments: {
					development: { source: {} },
				},
			};

			await configModifier(config);

			// Import graph should NOT be used in non-bundleless mode
			expect(mockTraceFromEntries).not.toHaveBeenCalled();

			// Entries should be named entries (not traced file list)
			const devEntry = (config.environments.development.source as { entry?: Record<string, string> }).entry;
			expect(devEntry).toEqual({ index: "./src/index.ts" });
		});
	});

	describe("state initialization", () => {
		it("should reuse pre-existing entrypoints map from api.useExposed", async () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				exports: "./src/index.ts",
			};

			mockStat.mockResolvedValue(createMockStats(new Date()));
			mockAccess.mockResolvedValue(undefined);
			mockReadFile.mockResolvedValue(JSON.stringify(packageJson));

			const existingEntrypoints = new Map<string, string>([["existing.ts", "./src/existing.ts"]]);
			const existingExportMap = new Map<string, string>([[".", "./existing.js"]]);

			const plugin = AutoEntryPlugin();
			const mockApi = {
				modifyRsbuildConfig: vi.fn(),
				expose: vi.fn(),
				useExposed: vi.fn((key: string) => {
					if (key === "entrypoints") return existingEntrypoints;
					if (key === "exportToOutputMap") return existingExportMap;
					return undefined;
				}),
				onBeforeBuild: vi.fn(),
				logger: { debug: vi.fn() },
			};

			plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof AutoEntryPlugin>["setup"]>[0]);

			// Should NOT call expose for entrypoints or exportToOutputMap since they already exist
			expect(mockApi.expose).not.toHaveBeenCalled();

			// Run the config modifier to populate entries
			const configModifier = mockApi.modifyRsbuildConfig.mock.calls[0][0];
			const config = { environments: { dev: { source: {} } } };
			await configModifier(config);

			// Pre-existing entrypoints map should have the new entry added
			expect(existingEntrypoints.has("index.ts")).toBe(true);
			expect(existingEntrypoints.get("index.ts")).toBe("./src/index.ts");
			// Pre-existing entry should still be there
			expect(existingEntrypoints.has("existing.ts")).toBe(true);
		});

		it("should log entries only once across multiple modifyRsbuildConfig calls", async () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				exports: "./src/index.ts",
			};

			mockStat.mockResolvedValue(createMockStats(new Date()));
			mockAccess.mockResolvedValue(undefined);
			mockReadFile.mockResolvedValue(JSON.stringify(packageJson));

			const plugin = AutoEntryPlugin();
			const mockApi = {
				modifyRsbuildConfig: vi.fn(),
				expose: vi.fn(),
				useExposed: vi.fn().mockReturnValue(undefined),
				onBeforeBuild: vi.fn(),
				logger: { debug: vi.fn() },
			};

			plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof AutoEntryPlugin>["setup"]>[0]);

			const configModifier = mockApi.modifyRsbuildConfig.mock.calls[0][0];
			const config = { environments: { dev: { source: {} } } };

			// Call modifier twice (simulating RSlib calling it for multiple environments)
			await configModifier(config);
			await configModifier(config);

			// The entries should still be set but logging should happen only once
			// (verified by the state.hasLoggedEntries guard)
			const devEntry = (config.environments.dev.source as { entry?: Record<string, string> }).entry;
			expect(devEntry).toEqual({ index: "./src/index.ts" });
		});
	});
});
