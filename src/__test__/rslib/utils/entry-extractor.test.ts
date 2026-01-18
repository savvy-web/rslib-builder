import type { PackageJson } from "type-fest";
import { describe, expect, it } from "vitest";
import { extractEntriesFromPackageJson } from "#utils/entry-extractor-utils.js";

describe("extractEntriesFromPackageJson", () => {
	it("should extract entries from exports field with string export", () => {
		const packageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
			exports: "./src/index.ts",
		};

		const { entries } = extractEntriesFromPackageJson(packageJson);

		expect(entries).toEqual({
			index: "./src/index.ts",
		});
	});

	it("should extract entries from exports field with object exports", () => {
		const packageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
			exports: {
				".": "./src/index.ts",
				"./utils": "./src/utils.ts",
				"./package.json": "./package.json", // Should be skipped
			},
		};

		const { entries } = extractEntriesFromPackageJson(packageJson);

		expect(entries).toEqual({
			index: "./src/index.ts",
			utils: "./src/utils.ts",
		});
	});

	it("should extract entries from exports with conditional exports", () => {
		const packageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
			exports: {
				".": {
					import: "./src/index.ts",
					require: "./dist/index.js",
				},
				"./utils": {
					import: "./src/utils.ts",
					require: "./dist/utils.js",
					types: "./dist/utils.d.ts",
				},
			},
		};

		const { entries } = extractEntriesFromPackageJson(packageJson);

		expect(entries).toEqual({
			index: "./src/index.ts", // from import field
			utils: "./src/utils.ts", // from import field
		});
	});

	it("should extract entries from bin field with string bin", () => {
		const packageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
			bin: "./src/cli.ts",
		};

		const { entries } = extractEntriesFromPackageJson(packageJson);

		expect(entries).toEqual({
			"bin/cli": "./src/cli.ts",
		});
	});

	it("should extract entries from bin field with object bin", () => {
		const packageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
			bin: {
				cli: "./src/cli.ts",
				tool: "./bin/tool.ts",
			},
		};

		const { entries } = extractEntriesFromPackageJson(packageJson);

		expect(entries).toEqual({
			"bin/cli": "./src/cli.ts",
			"bin/tool": "./bin/tool.ts",
		});
	});

	it("should skip non-TypeScript files", () => {
		const packageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
			exports: {
				".": "./src/index.js", // Should be skipped (JS file not in dist)
				"./readme": "./README.md", // Should be skipped
				"./config": "./config.json", // Should be skipped
			},
			bin: "./bin/cli.js", // Should be skipped (JS file not in dist)
		};

		const { entries } = extractEntriesFromPackageJson(packageJson);

		expect(entries).toEqual({});
	});

	it("should handle .tsx files", () => {
		const packageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
			exports: "./src/component.tsx",
			bin: "./bin/cli.tsx",
		};

		const { entries } = extractEntriesFromPackageJson(packageJson);

		expect(entries).toEqual({
			index: "./src/component.tsx",
			"bin/cli": "./bin/cli.tsx",
		});
	});

	it("should prioritize import over default over types in conditional exports", () => {
		const packageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
			exports: {
				"./utils": {
					types: "./dist/utils.d.ts", // Should not be used (not a source file)
					default: "./dist/utils.js", // Should not be used (not .ts)
					import: "./src/utils.ts", // Should be used (highest priority and .ts)
				},
			},
		};

		const { entries } = extractEntriesFromPackageJson(packageJson);

		expect(entries).toEqual({
			utils: "./src/utils.ts",
		});
	});

	it("should handle JSON schema exports that point to TypeScript files", () => {
		const packageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
			exports: {
				".": "./src/index.ts",
				"./schema.json": "./src/schema.ts", // Should be skipped (JSON exports)
				"./config.json": {
					import: "./src/config.ts", // Should be skipped (JSON exports)
					default: "./dist/config.js",
				},
			},
		};

		const { entries } = extractEntriesFromPackageJson(packageJson);

		expect(entries).toEqual({
			index: "./src/index.ts",
		});
	});

	it("should skip all JSON exports regardless of source", () => {
		const packageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
			exports: {
				".": "./src/index.ts",
				"./data.json": "./data.json", // Should be skipped (JSON to JSON)
				"./config.json": "./config.js", // Should be skipped (JSON export, non-TS source)
			},
		};

		const { entries } = extractEntriesFromPackageJson(packageJson);

		expect(entries).toEqual({
			index: "./src/index.ts",
		});
	});

	it("should handle package.json export correctly", () => {
		const packageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
			exports: {
				".": "./src/index.ts",
				"./package.json": "./package.json", // Should be skipped
			},
		};

		const { entries } = extractEntriesFromPackageJson(packageJson);

		expect(entries).toEqual({
			index: "./src/index.ts",
		});
	});

	it("should map JS dist files back to TS source files", () => {
		const packageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
			exports: {
				".": "./dist/index.js", // Should map to ./src/index.ts
				"./utils": {
					import: "./dist/utils.js", // Should map to ./src/utils.ts
				},
			},
			bin: {
				cli: "./dist/cli.js", // Should map to ./src/cli.ts
			},
		};

		const { entries } = extractEntriesFromPackageJson(packageJson);

		expect(entries).toEqual({
			index: "./src/index.ts",
			utils: "./src/utils.ts",
			"bin/cli": "./src/cli.ts",
		});
	});

	it("should handle JSON exports with conditional exports where import is null/undefined", () => {
		const packageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
			exports: {
				"./schema.json": {
					import: null, // null - should try default
					default: "./src/schema.ts", // should use this
				},
			},
		};

		const result = extractEntriesFromPackageJson(packageJson);

		expect(result.entries).toEqual({});
	});

	it("should handle JSON exports where key doesn't start with './'", () => {
		const packageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
			exports: {
				"schema.json": "./src/schema.ts", // No './' prefix
			},
		};

		const result = extractEntriesFromPackageJson(packageJson);

		expect(result.entries).toEqual({});
	});

	it("should handle regular exports where key doesn't start with './'", () => {
		const packageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
			exports: {
				utils: "./src/utils.ts", // No './' prefix
			},
		};

		const result = extractEntriesFromPackageJson(packageJson);

		expect(result.entries).toEqual({
			utils: "./src/utils.ts",
		});
	});

	it("should handle conditional exports with types fallback", () => {
		const packageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
			exports: {
				".": {
					import: null, // null - should try default
					default: null, // null - should try types
					types: "./src/index.d.ts", // Should use types as fallback
				},
			},
		};

		const result = extractEntriesFromPackageJson(packageJson);

		expect(result.entries).toEqual({
			index: "./src/index.d.ts", // Should use types as fallback
		});
	});

	it("should filter out non-TypeScript bin files from multiple bin entries", () => {
		const packageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
			bin: {
				"my-cli": "./src/cli.ts", // Should be included
				"shell-script": "./scripts/script.sh", // Should be filtered out
				"js-file": "./lib/script.js", // Should be filtered out
				"tsx-file": "./src/component.tsx", // Should be included
			},
		};

		const result = extractEntriesFromPackageJson(packageJson);

		expect(result.entries).toEqual({
			"bin/my-cli": "./src/cli.ts",
			"bin/tsx-file": "./src/component.tsx",
		});
	});
});
