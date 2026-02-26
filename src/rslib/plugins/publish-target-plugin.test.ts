import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PackageJson } from "../../types/package-json.js";
import type { PublishTarget, TransformPackageJsonFn } from "../builders/node-library-builder.js";

// Mock node:fs
vi.mock("node:fs", () => ({
	cpSync: vi.fn(),
	mkdirSync: vi.fn(),
	readFileSync: vi.fn(),
	writeFileSync: vi.fn(),
}));

// Mock node:path
vi.mock("node:path", () => ({
	join: vi.fn((...args: string[]) => args.join("/")),
}));

// Static imports after mocks are set up
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PublishTargetPlugin } from "./publish-target-plugin.js";

const mockCpSync: ReturnType<typeof vi.mocked<typeof cpSync>> = vi.mocked(cpSync);
const mockMkdirSync: ReturnType<typeof vi.mocked<typeof mkdirSync>> = vi.mocked(mkdirSync);
const mockReadFileSync: ReturnType<typeof vi.mocked<typeof readFileSync>> = vi.mocked(readFileSync);
const mockWriteFileSync: ReturnType<typeof vi.mocked<typeof writeFileSync>> = vi.mocked(writeFileSync);

function createMockTarget(overrides: Partial<PublishTarget> = {}): PublishTarget {
	return {
		protocol: "npm",
		registry: "https://registry.npmjs.org",
		directory: "/output/npm-target",
		access: "public",
		provenance: false,
		tag: "latest",
		...overrides,
	};
}

function createMockApi(basePackageJson: PackageJson | undefined = undefined): {
	onCloseBuild: ReturnType<typeof vi.fn>;
	useExposed: ReturnType<typeof vi.fn>;
} {
	return {
		onCloseBuild: vi.fn(),
		useExposed: vi.fn().mockReturnValue(basePackageJson),
	};
}

describe("PublishTargetPlugin", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should create plugin with correct name", () => {
		const plugin = PublishTargetPlugin({
			additionalTargets: [],
			primaryOutdir: "/output/primary",
			mode: "npm",
		});
		expect(plugin.name).toBe("publish-target-plugin");
		expect(typeof plugin.setup).toBe("function");
	});

	it("should register an onCloseBuild hook", () => {
		const plugin = PublishTargetPlugin({
			additionalTargets: [],
			primaryOutdir: "/output/primary",
			mode: "npm",
		});
		const mockApi = createMockApi();

		plugin.setup(mockApi as unknown as Parameters<typeof plugin.setup>[0]);

		expect(mockApi.onCloseBuild).toHaveBeenCalledTimes(1);
		expect(typeof mockApi.onCloseBuild.mock.calls[0][0]).toBe("function");
	});

	it("should no-op when additionalTargets is empty", async () => {
		const plugin = PublishTargetPlugin({
			additionalTargets: [],
			primaryOutdir: "/output/primary",
			mode: "npm",
		});
		const mockApi = createMockApi({ name: "test-pkg", version: "1.0.0" });

		plugin.setup(mockApi as unknown as Parameters<typeof plugin.setup>[0]);

		const callback = mockApi.onCloseBuild.mock.calls[0][0];
		await callback();

		// Should return early without reading any files or creating directories
		expect(mockApi.useExposed).not.toHaveBeenCalled();
		expect(mockMkdirSync).not.toHaveBeenCalled();
		expect(mockCpSync).not.toHaveBeenCalled();
		expect(mockWriteFileSync).not.toHaveBeenCalled();
	});

	it("should no-op when base-package-json is not exposed", async () => {
		const target = createMockTarget();
		const plugin = PublishTargetPlugin({
			additionalTargets: [target],
			primaryOutdir: "/output/primary",
			mode: "npm",
		});
		const mockApi = createMockApi(undefined);

		plugin.setup(mockApi as unknown as Parameters<typeof plugin.setup>[0]);

		const callback = mockApi.onCloseBuild.mock.calls[0][0];
		await callback();

		expect(mockApi.useExposed).toHaveBeenCalledWith("base-package-json");
		// Should return early without creating directories or writing files
		expect(mockMkdirSync).not.toHaveBeenCalled();
		expect(mockCpSync).not.toHaveBeenCalled();
		expect(mockWriteFileSync).not.toHaveBeenCalled();
	});

	it("should create target directory, copy build output, and write per-target package.json", async () => {
		const basePackageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
			type: "module",
		};
		const primaryPkg: PackageJson = {
			name: "test-package",
			version: "1.0.0",
			files: ["index.js", "index.d.ts"],
		};
		const target = createMockTarget({ directory: "/output/npm-target" });

		const plugin = PublishTargetPlugin({
			additionalTargets: [target],
			primaryOutdir: "/output/primary",
			mode: "npm",
		});
		const mockApi = createMockApi(basePackageJson);

		mockReadFileSync.mockReturnValue(JSON.stringify(primaryPkg));

		plugin.setup(mockApi as unknown as Parameters<typeof plugin.setup>[0]);

		const callback = mockApi.onCloseBuild.mock.calls[0][0];
		await callback();

		// 1. Creates target directory
		expect(mockMkdirSync).toHaveBeenCalledWith("/output/npm-target", { recursive: true });

		// 2. Copies build output from primary
		expect(mockCpSync).toHaveBeenCalledWith("/output/primary", "/output/npm-target", { recursive: true });

		// 3. Writes package.json to target directory
		expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
		const writtenPath = mockWriteFileSync.mock.calls[0][0];
		const writtenContent = JSON.parse((mockWriteFileSync.mock.calls[0][1] as string).trim()) as PackageJson;

		expect(writtenPath).toBe("/output/npm-target/package.json");
		expect(writtenContent.name).toBe("test-package");
		expect(writtenContent.version).toBe("1.0.0");
		expect(writtenContent.type).toBe("module");
		// files array copied from primary output
		expect(writtenContent.files).toEqual(["index.js", "index.d.ts"]);
	});

	it("should apply user transform with correct context", async () => {
		const basePackageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
		};
		const primaryPkg: PackageJson = {
			name: "test-package",
			version: "1.0.0",
		};
		const target = createMockTarget({ directory: "/output/jsr-target", protocol: "jsr", registry: null });

		const transform: TransformPackageJsonFn = vi.fn().mockImplementation(({ pkg }) => {
			return { ...pkg, description: "transformed" };
		});

		const plugin = PublishTargetPlugin({
			additionalTargets: [target],
			primaryOutdir: "/output/primary",
			mode: "npm",
			transform,
		});
		const mockApi = createMockApi(basePackageJson);

		mockReadFileSync.mockReturnValue(JSON.stringify(primaryPkg));

		plugin.setup(mockApi as unknown as Parameters<typeof plugin.setup>[0]);

		const callback = mockApi.onCloseBuild.mock.calls[0][0];
		await callback();

		// Transform should be called with correct context
		expect(transform).toHaveBeenCalledTimes(1);
		expect(transform).toHaveBeenCalledWith({
			mode: "npm",
			target,
			pkg: expect.objectContaining({ name: "test-package", version: "1.0.0" }),
		});

		// Written package.json should reflect the transform
		const writtenContent = JSON.parse((mockWriteFileSync.mock.calls[0][1] as string).trim()) as PackageJson;
		expect(writtenContent.description).toBe("transformed");
	});

	it("should apply name override when configured", async () => {
		const basePackageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
		};
		const primaryPkg: PackageJson = {
			name: "test-package",
			version: "1.0.0",
		};
		const target = createMockTarget();

		const plugin = PublishTargetPlugin({
			additionalTargets: [target],
			primaryOutdir: "/output/primary",
			mode: "npm",
			name: "@scope/override-name",
		});
		const mockApi = createMockApi(basePackageJson);

		mockReadFileSync.mockReturnValue(JSON.stringify(primaryPkg));

		plugin.setup(mockApi as unknown as Parameters<typeof plugin.setup>[0]);

		const callback = mockApi.onCloseBuild.mock.calls[0][0];
		await callback();

		const writtenContent = JSON.parse((mockWriteFileSync.mock.calls[0][1] as string).trim()) as PackageJson;
		expect(writtenContent.name).toBe("@scope/override-name");
	});

	it("should copy files array from primary output's package.json", async () => {
		const basePackageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
		};
		const primaryPkg: PackageJson = {
			name: "test-package",
			version: "1.0.0",
			files: ["esm/index.js", "esm/index.d.ts", "package.json", "README.md"],
		};
		const target = createMockTarget();

		const plugin = PublishTargetPlugin({
			additionalTargets: [target],
			primaryOutdir: "/output/primary",
			mode: "npm",
		});
		const mockApi = createMockApi(basePackageJson);

		mockReadFileSync.mockReturnValue(JSON.stringify(primaryPkg));

		plugin.setup(mockApi as unknown as Parameters<typeof plugin.setup>[0]);

		const callback = mockApi.onCloseBuild.mock.calls[0][0];
		await callback();

		const writtenContent = JSON.parse((mockWriteFileSync.mock.calls[0][1] as string).trim()) as PackageJson;
		expect(writtenContent.files).toEqual(["esm/index.js", "esm/index.d.ts", "package.json", "README.md"]);
	});

	it("should not set files array when primary output has no files field", async () => {
		const basePackageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
		};
		const primaryPkg: PackageJson = {
			name: "test-package",
			version: "1.0.0",
			// No files field
		};
		const target = createMockTarget();

		const plugin = PublishTargetPlugin({
			additionalTargets: [target],
			primaryOutdir: "/output/primary",
			mode: "npm",
		});
		const mockApi = createMockApi(basePackageJson);

		mockReadFileSync.mockReturnValue(JSON.stringify(primaryPkg));

		plugin.setup(mockApi as unknown as Parameters<typeof plugin.setup>[0]);

		const callback = mockApi.onCloseBuild.mock.calls[0][0];
		await callback();

		const writtenContent = JSON.parse((mockWriteFileSync.mock.calls[0][1] as string).trim()) as PackageJson;
		expect(writtenContent.files).toBeUndefined();
	});

	it("should handle multiple additional targets", async () => {
		const basePackageJson: PackageJson = {
			name: "test-package",
			version: "2.0.0",
			type: "module",
		};
		const primaryPkg: PackageJson = {
			name: "test-package",
			version: "2.0.0",
			files: ["index.js"],
		};

		const npmTarget = createMockTarget({
			directory: "/output/npm-target",
			protocol: "npm",
			registry: "https://registry.npmjs.org",
		});
		const jsrTarget = createMockTarget({
			directory: "/output/jsr-target",
			protocol: "jsr",
			registry: null,
		});

		const plugin = PublishTargetPlugin({
			additionalTargets: [npmTarget, jsrTarget],
			primaryOutdir: "/output/primary",
			mode: "npm",
		});
		const mockApi = createMockApi(basePackageJson);

		mockReadFileSync.mockReturnValue(JSON.stringify(primaryPkg));

		plugin.setup(mockApi as unknown as Parameters<typeof plugin.setup>[0]);

		const callback = mockApi.onCloseBuild.mock.calls[0][0];
		await callback();

		// Should create directories for both targets
		expect(mockMkdirSync).toHaveBeenCalledTimes(2);
		expect(mockMkdirSync).toHaveBeenCalledWith("/output/npm-target", { recursive: true });
		expect(mockMkdirSync).toHaveBeenCalledWith("/output/jsr-target", { recursive: true });

		// Should copy build output for both targets
		expect(mockCpSync).toHaveBeenCalledTimes(2);
		expect(mockCpSync).toHaveBeenCalledWith("/output/primary", "/output/npm-target", { recursive: true });
		expect(mockCpSync).toHaveBeenCalledWith("/output/primary", "/output/jsr-target", { recursive: true });

		// Should write package.json for both targets
		expect(mockWriteFileSync).toHaveBeenCalledTimes(2);

		const firstWrittenPath = mockWriteFileSync.mock.calls[0][0];
		const secondWrittenPath = mockWriteFileSync.mock.calls[1][0];
		expect(firstWrittenPath).toBe("/output/npm-target/package.json");
		expect(secondWrittenPath).toBe("/output/jsr-target/package.json");

		// Both should have the base package.json data with files from primary
		const firstContent = JSON.parse((mockWriteFileSync.mock.calls[0][1] as string).trim()) as PackageJson;
		const secondContent = JSON.parse((mockWriteFileSync.mock.calls[1][1] as string).trim()) as PackageJson;

		expect(firstContent.name).toBe("test-package");
		expect(firstContent.version).toBe("2.0.0");
		expect(firstContent.files).toEqual(["index.js"]);

		expect(secondContent.name).toBe("test-package");
		expect(secondContent.version).toBe("2.0.0");
		expect(secondContent.files).toEqual(["index.js"]);
	});

	it("should apply transform independently per target with deep-copied base state", async () => {
		const basePackageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
			exports: { ".": "./index.js" },
		};
		const primaryPkg: PackageJson = {
			name: "test-package",
			version: "1.0.0",
		};

		const npmTarget = createMockTarget({ directory: "/output/npm-target", protocol: "npm" });
		const jsrTarget = createMockTarget({ directory: "/output/jsr-target", protocol: "jsr", registry: null });

		const transform: TransformPackageJsonFn = vi.fn().mockImplementation(({ target, pkg }) => {
			const result = { ...pkg };
			if ((target as PublishTarget).protocol === "jsr") {
				result.description = "jsr version";
			} else {
				result.description = "npm version";
			}
			return result;
		});

		const plugin = PublishTargetPlugin({
			additionalTargets: [npmTarget, jsrTarget],
			primaryOutdir: "/output/primary",
			mode: "npm",
			transform,
		});
		const mockApi = createMockApi(basePackageJson);

		mockReadFileSync.mockReturnValue(JSON.stringify(primaryPkg));

		plugin.setup(mockApi as unknown as Parameters<typeof plugin.setup>[0]);

		const callback = mockApi.onCloseBuild.mock.calls[0][0];
		await callback();

		// Transform should be called once per target
		expect(transform).toHaveBeenCalledTimes(2);

		// Each target should have its own transformed content
		const npmContent = JSON.parse((mockWriteFileSync.mock.calls[0][1] as string).trim()) as PackageJson;
		const jsrContent = JSON.parse((mockWriteFileSync.mock.calls[1][1] as string).trim()) as PackageJson;

		expect(npmContent.description).toBe("npm version");
		expect(jsrContent.description).toBe("jsr version");
	});

	it("should skip directory creation and copy when target directory matches primary outdir", async () => {
		const basePackageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
			type: "module",
		};
		const primaryPkg: PackageJson = {
			name: "test-package",
			version: "1.0.0",
			files: ["index.js", "index.d.ts"],
		};

		// Target directory is the same as primary outdir (e.g. multiple registries sharing dist/npm)
		const target = createMockTarget({ directory: "/output/primary" });

		const plugin = PublishTargetPlugin({
			additionalTargets: [target],
			primaryOutdir: "/output/primary",
			mode: "npm",
		});
		const mockApi = createMockApi(basePackageJson);

		mockReadFileSync.mockReturnValue(JSON.stringify(primaryPkg));

		plugin.setup(mockApi as unknown as Parameters<typeof plugin.setup>[0]);

		const callback = mockApi.onCloseBuild.mock.calls[0][0];
		await callback();

		// Should NOT create directory or copy (src === dest)
		expect(mockMkdirSync).not.toHaveBeenCalled();
		expect(mockCpSync).not.toHaveBeenCalled();

		// Should still write the per-target package.json
		expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
		const writtenPath = mockWriteFileSync.mock.calls[0][0];
		expect(writtenPath).toBe("/output/primary/package.json");

		const writtenContent = JSON.parse((mockWriteFileSync.mock.calls[0][1] as string).trim()) as PackageJson;
		expect(writtenContent.files).toEqual(["index.js", "index.d.ts"]);
	});

	it("should only copy for targets with different directories in mixed scenarios", async () => {
		const basePackageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
		};
		const primaryPkg: PackageJson = {
			name: "test-package",
			version: "1.0.0",
			files: ["index.js"],
		};

		// One target shares primary directory, another has a different directory
		const sameDir = createMockTarget({ directory: "/output/primary", registry: "https://npm.pkg.github.com/" });
		const diffDir = createMockTarget({ directory: "/output/jsr-target", protocol: "jsr", registry: null });

		const plugin = PublishTargetPlugin({
			additionalTargets: [sameDir, diffDir],
			primaryOutdir: "/output/primary",
			mode: "npm",
		});
		const mockApi = createMockApi(basePackageJson);

		mockReadFileSync.mockReturnValue(JSON.stringify(primaryPkg));

		plugin.setup(mockApi as unknown as Parameters<typeof plugin.setup>[0]);

		const callback = mockApi.onCloseBuild.mock.calls[0][0];
		await callback();

		// Only the different-directory target should get mkdir + cpSync
		expect(mockMkdirSync).toHaveBeenCalledTimes(1);
		expect(mockMkdirSync).toHaveBeenCalledWith("/output/jsr-target", { recursive: true });
		expect(mockCpSync).toHaveBeenCalledTimes(1);
		expect(mockCpSync).toHaveBeenCalledWith("/output/primary", "/output/jsr-target", { recursive: true });

		// Both targets should still get package.json written
		expect(mockWriteFileSync).toHaveBeenCalledTimes(2);
		expect(mockWriteFileSync.mock.calls[0][0]).toBe("/output/primary/package.json");
		expect(mockWriteFileSync.mock.calls[1][0]).toBe("/output/jsr-target/package.json");
	});

	it("should write package.json with trailing newline", async () => {
		const basePackageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
		};
		const primaryPkg: PackageJson = {
			name: "test-package",
			version: "1.0.0",
		};
		const target = createMockTarget();

		const plugin = PublishTargetPlugin({
			additionalTargets: [target],
			primaryOutdir: "/output/primary",
			mode: "npm",
		});
		const mockApi = createMockApi(basePackageJson);

		mockReadFileSync.mockReturnValue(JSON.stringify(primaryPkg));

		plugin.setup(mockApi as unknown as Parameters<typeof plugin.setup>[0]);

		const callback = mockApi.onCloseBuild.mock.calls[0][0];
		await callback();

		const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
		expect(writtenContent.endsWith("\n")).toBe(true);
	});
});
