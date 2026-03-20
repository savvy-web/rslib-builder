import { describe, expect, it, vi } from "vitest";
import { VirtualEntryPlugin } from "./virtual-entry-plugin.js";

describe("VirtualEntryPlugin", () => {
	it("should create plugin with correct name", () => {
		const plugin = VirtualEntryPlugin({
			virtualEntryNames: new Set(["pnpmfile"]),
		});
		expect(plugin.name).toBe("virtual-entry-plugin");
		expect(typeof plugin.setup).toBe("function");
	});

	it("should expose virtual entry names for DtsPlugin", () => {
		const virtualEntryNames = new Set(["pnpmfile", "config"]);
		const plugin = VirtualEntryPlugin({
			virtualEntryNames,
		});

		const mockApi = {
			expose: vi.fn(),
			processAssets: vi.fn(),
		};

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof VirtualEntryPlugin>["setup"]>[0]);

		// Should expose virtual entry names
		expect(mockApi.expose).toHaveBeenCalledWith("virtual-entry-names", virtualEntryNames);
	});

	it("should register processAssets hook with additional stage", () => {
		const plugin = VirtualEntryPlugin({
			virtualEntryNames: new Set(["pnpmfile"]),
		});

		const mockApi = {
			expose: vi.fn(),
			processAssets: vi.fn(),
		};

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof VirtualEntryPlugin>["setup"]>[0]);

		// Should register processAssets hook
		expect(mockApi.processAssets).toHaveBeenCalledTimes(1);
		expect(mockApi.processAssets.mock.calls[0][0]).toEqual({ stage: "additional" });
	});

	it("should create files array if not exposed and add virtual entry outputs", async () => {
		const virtualEntryNames = new Set(["pnpmfile"]);
		const plugin = VirtualEntryPlugin({
			virtualEntryNames,
		});

		const mockApi = {
			expose: vi.fn(),
			useExposed: vi.fn().mockReturnValue(undefined),
			processAssets: vi.fn(),
		};

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof VirtualEntryPlugin>["setup"]>[0]);

		// Get the callback function
		const callback = mockApi.processAssets.mock.calls[0][1];

		const mockContext = {
			compilation: {
				assets: {
					"pnpmfile.cjs": { source: () => "// pnpmfile" },
					"index.js": { source: () => "// index" },
				},
			},
		};

		await callback(mockContext);

		// Should have created and exposed a new files array
		expect(mockApi.expose).toHaveBeenCalledWith("files-array", expect.any(Set));

		// Get the exposed Set
		const filesArrayExposeCall = mockApi.expose.mock.calls.find((call) => call[0] === "files-array");
		expect(filesArrayExposeCall).toBeDefined();
		if (!filesArrayExposeCall) return;
		const filesArray = filesArrayExposeCall[1] as Set<string>;

		// Should contain the virtual entry output
		expect(filesArray.has("pnpmfile.cjs")).toBe(true);
		// Should NOT contain regular entries
		expect(filesArray.has("index.js")).toBe(false);
	});

	it("should use existing files array if exposed", async () => {
		const virtualEntryNames = new Set(["pnpmfile"]);
		const plugin = VirtualEntryPlugin({
			virtualEntryNames,
		});

		const existingFilesArray = new Set(["existing.js"]);
		const mockApi = {
			expose: vi.fn(),
			useExposed: vi.fn().mockReturnValue(existingFilesArray),
			processAssets: vi.fn(),
		};

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof VirtualEntryPlugin>["setup"]>[0]);

		// Get the callback function
		const callback = mockApi.processAssets.mock.calls[0][1];

		const mockContext = {
			compilation: {
				assets: {
					"pnpmfile.cjs": { source: () => "// pnpmfile" },
				},
			},
		};

		await callback(mockContext);

		// Should NOT have called expose again for files-array (only for virtual-entry-names)
		const filesArrayExposeCalls = mockApi.expose.mock.calls.filter((call) => call[0] === "files-array");
		expect(filesArrayExposeCalls.length).toBe(0);

		// Should have added to existing files array
		expect(existingFilesArray.has("pnpmfile.cjs")).toBe(true);
		expect(existingFilesArray.has("existing.js")).toBe(true);
	});

	it("should handle multiple virtual entries with different extensions", async () => {
		const virtualEntryNames = new Set(["pnpmfile", "config"]);
		const plugin = VirtualEntryPlugin({
			virtualEntryNames,
		});

		const mockApi = {
			expose: vi.fn(),
			useExposed: vi.fn().mockReturnValue(undefined),
			processAssets: vi.fn(),
		};

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof VirtualEntryPlugin>["setup"]>[0]);

		// Get the callback function
		const callback = mockApi.processAssets.mock.calls[0][1];

		const mockContext = {
			compilation: {
				assets: {
					"pnpmfile.cjs": { source: () => "// pnpmfile" },
					"config.js": { source: () => "// config" },
					"index.js": { source: () => "// index" },
				},
			},
		};

		await callback(mockContext);

		// Get the exposed Set
		const filesArrayExposeCall = mockApi.expose.mock.calls.find((call) => call[0] === "files-array");
		expect(filesArrayExposeCall).toBeDefined();
		if (!filesArrayExposeCall) return;
		const filesArray = filesArrayExposeCall[1] as Set<string>;

		// Should contain both virtual entry outputs
		expect(filesArray.has("pnpmfile.cjs")).toBe(true);
		expect(filesArray.has("config.js")).toBe(true);
		// Should NOT contain regular entries
		expect(filesArray.has("index.js")).toBe(false);
	});

	it("should handle .mjs extension for virtual entries", async () => {
		const virtualEntryNames = new Set(["helper"]);
		const plugin = VirtualEntryPlugin({
			virtualEntryNames,
		});

		const mockApi = {
			expose: vi.fn(),
			useExposed: vi.fn().mockReturnValue(undefined),
			processAssets: vi.fn(),
		};

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof VirtualEntryPlugin>["setup"]>[0]);

		// Get the callback function
		const callback = mockApi.processAssets.mock.calls[0][1];

		const mockContext = {
			compilation: {
				assets: {
					"helper.mjs": { source: () => "// helper" },
				},
			},
		};

		await callback(mockContext);

		// Get the exposed Set
		const filesArrayExposeCall = mockApi.expose.mock.calls.find((call) => call[0] === "files-array");
		expect(filesArrayExposeCall).toBeDefined();
		if (!filesArrayExposeCall) return;
		const filesArray = filesArrayExposeCall[1] as Set<string>;

		// Should contain the virtual entry output with .mjs extension
		expect(filesArray.has("helper.mjs")).toBe(true);
	});

	it("should not add non-virtual entries to files array", async () => {
		const virtualEntryNames = new Set(["pnpmfile"]);
		const plugin = VirtualEntryPlugin({
			virtualEntryNames,
		});

		const mockApi = {
			expose: vi.fn(),
			useExposed: vi.fn().mockReturnValue(undefined),
			processAssets: vi.fn(),
		};

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof VirtualEntryPlugin>["setup"]>[0]);

		// Get the callback function
		const callback = mockApi.processAssets.mock.calls[0][1];

		const mockContext = {
			compilation: {
				assets: {
					"index.js": { source: () => "// index" },
					"other.cjs": { source: () => "// other" },
					"utils.mjs": { source: () => "// utils" },
				},
			},
		};

		await callback(mockContext);

		// Get the exposed Set
		const filesArrayExposeCall = mockApi.expose.mock.calls.find((call) => call[0] === "files-array");
		expect(filesArrayExposeCall).toBeDefined();
		if (!filesArrayExposeCall) return;
		const filesArray = filesArrayExposeCall[1] as Set<string>;

		// Should be empty since none of the assets match virtual entry names
		expect(filesArray.size).toBe(0);
	});

	it("should handle empty virtual entry names set", async () => {
		const virtualEntryNames = new Set<string>();
		const plugin = VirtualEntryPlugin({
			virtualEntryNames,
		});

		const mockApi = {
			expose: vi.fn(),
			useExposed: vi.fn().mockReturnValue(undefined),
			processAssets: vi.fn(),
		};

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof VirtualEntryPlugin>["setup"]>[0]);

		// Get the callback function
		const callback = mockApi.processAssets.mock.calls[0][1];

		const mockContext = {
			compilation: {
				assets: {
					"index.js": { source: () => "// index" },
				},
			},
		};

		await callback(mockContext);

		// Get the exposed Set
		const filesArrayExposeCall = mockApi.expose.mock.calls.find((call) => call[0] === "files-array");
		expect(filesArrayExposeCall).toBeDefined();
		if (!filesArrayExposeCall) return;
		const filesArray = filesArrayExposeCall[1] as Set<string>;

		// Should be empty since no virtual entries configured
		expect(filesArray.size).toBe(0);
	});

	it("should handle empty compilation assets", async () => {
		const virtualEntryNames = new Set(["pnpmfile"]);
		const plugin = VirtualEntryPlugin({
			virtualEntryNames,
		});

		const mockApi = {
			expose: vi.fn(),
			useExposed: vi.fn().mockReturnValue(undefined),
			processAssets: vi.fn(),
		};

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof VirtualEntryPlugin>["setup"]>[0]);

		// Get the callback function
		const callback = mockApi.processAssets.mock.calls[0][1];

		const mockContext = {
			compilation: {
				assets: {},
			},
		};

		await callback(mockContext);

		// Get the exposed Set
		const filesArrayExposeCall = mockApi.expose.mock.calls.find((call) => call[0] === "files-array");
		expect(filesArrayExposeCall).toBeDefined();
		if (!filesArrayExposeCall) return;
		const filesArray = filesArrayExposeCall[1] as Set<string>;

		// Should be empty since no assets
		expect(filesArray.size).toBe(0);
	});
});
