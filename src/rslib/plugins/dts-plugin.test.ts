import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	collectDtsFiles,
	ensureTempDeclarationDir,
	findTsConfig,
	generateTsgoArgs,
	getTsgoBinPath,
	getUnscopedPackageName,
	stripSourceMapComment,
} from "./dts-plugin.js";

// Track created test directories for cleanup
const testDirs: string[] = [];

function createTestDir(): string {
	const dir = join(tmpdir(), `dts-plugin-test-${Date.now()}-${Math.random().toString(36).substring(7)}`);
	testDirs.push(dir);
	return dir;
}

describe("dts-plugin utilities", () => {
	// Build sourceMappingURL dynamically to prevent Vite from trying to load non-existent .map files
	const SOURCE_MAP_PREFIX = "//# source" + "MappingURL=";

	afterEach(async () => {
		// Clean up all test directories
		await Promise.all(testDirs.map((dir) => rm(dir, { recursive: true, force: true })));
		testDirs.length = 0;
	});

	describe("stripSourceMapComment", () => {
		it("should strip sourceMappingURL comment from single line", () => {
			const content = `export declare const foo: string;\n${SOURCE_MAP_PREFIX}index.d.ts.map`;
			const result = stripSourceMapComment(content);
			expect(result).toBe("export declare const foo: string;");
		});

		it("should strip sourceMappingURL comment from multiple lines", () => {
			const content = `export declare const foo: string;
${SOURCE_MAP_PREFIX}foo.d.ts.map
export declare const bar: number;
${SOURCE_MAP_PREFIX}bar.d.ts.map`;
			const result = stripSourceMapComment(content);
			expect(result).toBe(`export declare const foo: string;\n\nexport declare const bar: number;`);
		});

		it("should handle content without sourceMappingURL", () => {
			const content = "export declare const foo: string;";
			const result = stripSourceMapComment(content);
			expect(result).toBe("export declare const foo: string;");
		});

		it("should handle empty content", () => {
			const result = stripSourceMapComment("");
			expect(result).toBe("");
		});

		it("should handle only sourceMappingURL comment", () => {
			const content = `${SOURCE_MAP_PREFIX}index.d.ts.map`;
			const result = stripSourceMapComment(content);
			expect(result).toBe("");
		});

		it("should preserve other comments", () => {
			const content = `// This is a regular comment
export declare const foo: string;
/** TSDoc comment */
export declare const bar: number;
${SOURCE_MAP_PREFIX}index.d.ts.map`;
			const result = stripSourceMapComment(content);
			expect(result).toBe(`// This is a regular comment
export declare const foo: string;
/** TSDoc comment */
export declare const bar: number;`);
		});
	});

	describe("getUnscopedPackageName", () => {
		it("should extract name from scoped package", () => {
			expect(getUnscopedPackageName("@scope/package-name")).toBe("package-name");
		});

		it("should return name unchanged for unscoped package", () => {
			expect(getUnscopedPackageName("package-name")).toBe("package-name");
		});

		it("should handle scoped package with nested path", () => {
			expect(getUnscopedPackageName("@my-org/my-package")).toBe("my-package");
		});

		it("should handle empty scope", () => {
			expect(getUnscopedPackageName("@/package")).toBe("package");
		});

		it("should return original if no slash after @", () => {
			expect(getUnscopedPackageName("@no-slash")).toBe("@no-slash");
		});
	});

	describe("generateTsgoArgs", () => {
		it("should generate basic tsgo arguments", () => {
			const args = generateTsgoArgs({
				configPath: "/path/to/tsconfig.json",
				declarationDir: "/path/to/declarations",
			});

			expect(args).toEqual([
				"--project",
				"/path/to/tsconfig.json",
				"--declaration",
				"--emitDeclarationOnly",
				"--declarationMap",
				"--declarationDir",
				"/path/to/declarations",
			]);
		});

		it("should include rootDir when provided", () => {
			const args = generateTsgoArgs({
				configPath: "/path/to/tsconfig.json",
				declarationDir: "/path/to/declarations",
				rootDir: "/path/to/src",
			});

			expect(args).toContain("--rootDir");
			expect(args).toContain("/path/to/src");
		});

		it("should include tsBuildInfoFile when provided", () => {
			const args = generateTsgoArgs({
				configPath: "/path/to/tsconfig.json",
				declarationDir: "/path/to/declarations",
				tsBuildInfoFile: "/path/to/.tsbuildinfo",
			});

			expect(args).toContain("--tsBuildInfoFile");
			expect(args).toContain("/path/to/.tsbuildinfo");
		});

		it("should include both optional arguments when provided", () => {
			const args = generateTsgoArgs({
				configPath: "/path/to/tsconfig.json",
				declarationDir: "/path/to/declarations",
				rootDir: "/path/to/src",
				tsBuildInfoFile: "/path/to/.tsbuildinfo",
			});

			expect(args).toEqual([
				"--project",
				"/path/to/tsconfig.json",
				"--declaration",
				"--emitDeclarationOnly",
				"--declarationMap",
				"--declarationDir",
				"/path/to/declarations",
				"--rootDir",
				"/path/to/src",
				"--tsBuildInfoFile",
				"/path/to/.tsbuildinfo",
			]);
		});
	});

	describe("collectDtsFiles", () => {
		it("should collect .d.ts files from a directory", async () => {
			// Create a temporary directory for testing
			const testDir = createTestDir();
			await mkdir(testDir, { recursive: true });

			// Create some test files
			await writeFile(join(testDir, "index.d.ts"), "export declare const foo: string;");
			await writeFile(join(testDir, "utils.d.ts"), "export declare const bar: number;");
			await writeFile(join(testDir, "index.js"), "export const foo = 'test';");

			const files = await collectDtsFiles(testDir);

			expect(files).toHaveLength(2);
			expect(files.map((f) => f.relativePath).sort()).toEqual(["index.d.ts", "utils.d.ts"]);
		});

		it("should collect .d.ts.map files", async () => {
			const testDir = createTestDir();
			await mkdir(testDir, { recursive: true });

			await writeFile(join(testDir, "index.d.ts"), "export declare const foo: string;");
			await writeFile(join(testDir, "index.d.ts.map"), '{"version":3}');

			const files = await collectDtsFiles(testDir);

			expect(files).toHaveLength(2);
			expect(files.map((f) => f.relativePath).sort()).toEqual(["index.d.ts", "index.d.ts.map"]);
		});

		it("should recursively collect files from subdirectories", async () => {
			const testDir = createTestDir();
			const subDir = join(testDir, "utils");
			await mkdir(subDir, { recursive: true });

			await writeFile(join(testDir, "index.d.ts"), "export declare const foo: string;");
			await writeFile(join(subDir, "helpers.d.ts"), "export declare const bar: number;");

			const files = await collectDtsFiles(testDir);

			expect(files).toHaveLength(2);
			const relativePaths = files.map((f) => f.relativePath).sort();
			expect(relativePaths).toEqual(["index.d.ts", "utils/helpers.d.ts"]);
		});

		it("should return empty array for directory with no .d.ts files", async () => {
			const testDir = createTestDir();
			await mkdir(testDir, { recursive: true });

			await writeFile(join(testDir, "index.js"), "export const foo = 'test';");
			await writeFile(join(testDir, "index.ts"), "export const foo: string = 'test';");

			const files = await collectDtsFiles(testDir);

			expect(files).toHaveLength(0);
		});

		it("should handle deeply nested directory structures", async () => {
			const testDir = createTestDir();
			const deepDir = join(testDir, "a", "b", "c");
			await mkdir(deepDir, { recursive: true });

			await writeFile(join(testDir, "root.d.ts"), "export declare const root: string;");
			await writeFile(join(deepDir, "deep.d.ts"), "export declare const deep: string;");

			const files = await collectDtsFiles(testDir);

			expect(files).toHaveLength(2);
			const relativePaths = files.map((f) => f.relativePath).sort();
			expect(relativePaths).toEqual(["a/b/c/deep.d.ts", "root.d.ts"]);
		});

		it("should return full path for each file", async () => {
			const testDir = createTestDir();
			await mkdir(testDir, { recursive: true });

			await writeFile(join(testDir, "index.d.ts"), "export declare const foo: string;");

			const files = await collectDtsFiles(testDir);

			expect(files).toHaveLength(1);
			expect(files[0].path).toBe(join(testDir, "index.d.ts"));
			expect(files[0].relativePath).toBe("index.d.ts");
		});

		it("should use custom baseDir for relative paths", async () => {
			const testDir = createTestDir();
			const subDir = join(testDir, "dist");
			await mkdir(subDir, { recursive: true });

			await writeFile(join(subDir, "index.d.ts"), "export declare const foo: string;");

			// Use testDir as baseDir but scan subDir
			const files = await collectDtsFiles(subDir, testDir);

			expect(files).toHaveLength(1);
			expect(files[0].relativePath).toBe("dist/index.d.ts");
		});
	});

	describe("getTsgoBinPath", () => {
		const originalCwd = process.cwd();

		beforeEach(() => {
			vi.clearAllMocks();
		});

		afterEach(() => {
			process.chdir(originalCwd);
		});

		it("should return local tsgo path when file doesn't exist", async () => {
			const testDir = createTestDir();
			await mkdir(testDir, { recursive: true });
			process.chdir(testDir);

			const binPath = getTsgoBinPath();
			expect(binPath).toMatch(/node_modules\/\.bin\/tsgo$/);
		});

		it("should return local tsgo path when it exists", async () => {
			const testDir = createTestDir();
			const binDir = join(testDir, "node_modules", ".bin");
			await mkdir(binDir, { recursive: true });
			const tsgoBinPath = join(binDir, "tsgo");
			await writeFile(tsgoBinPath, "#!/usr/bin/env node");

			process.chdir(testDir);

			const binPath = getTsgoBinPath();
			expect(binPath).toMatch(/node_modules\/\.bin\/tsgo$/);
			expect(existsSync(binPath)).toBe(true);
		});

		it("should find tsgo in workspace root when not in local node_modules", async () => {
			// This test verifies the workspace root fallback by running from the actual project
			// where tsgo exists in the workspace root's node_modules
			const binPath = getTsgoBinPath();
			// Should find tsgo somewhere in the path
			expect(binPath).toMatch(/node_modules\/\.bin\/tsgo$/);
			// The actual tsgo should exist since we're in the real project
			expect(existsSync(binPath)).toBe(true);
		});
	});

	describe("ensureTempDeclarationDir", () => {
		it("should create temp declaration directory", async () => {
			const testDir = createTestDir();
			const name = "test-env";

			const dir = await ensureTempDeclarationDir(testDir, name);

			expect(dir).toBe(join(testDir, ".rslib", "declarations", name));
			expect(existsSync(dir)).toBe(true);
		});

		it("should clean existing directory before creating", async () => {
			const testDir = createTestDir();
			const name = "test-env";
			const dir = join(testDir, ".rslib", "declarations", name);

			await mkdir(dir, { recursive: true });
			await writeFile(join(dir, "old-file.d.ts"), "old content");

			const result = await ensureTempDeclarationDir(testDir, name);

			expect(result).toBe(dir);
			expect(existsSync(join(dir, "old-file.d.ts"))).toBe(false);
		});
	});

	describe("findTsConfig", () => {
		it("should return null when no config file exists", () => {
			const testDir = createTestDir();
			const result = findTsConfig(testDir);
			expect(result).toBe(null);
		});

		it("should find absolute path when provided and file exists", async () => {
			const testDir = createTestDir();
			await mkdir(testDir, { recursive: true });
			const configPath = join(testDir, "tsconfig.json");
			await writeFile(configPath, "{}");

			const result = findTsConfig(testDir, configPath);
			expect(result).toBe(configPath);
		});
	});
});
