// biome-ignore lint/correctness/noUndeclaredDependencies: this is OK because these are only used in test files
import { describe, expect } from "vitest";
import { assertBuildSucceeded, assertOutputFile, assertPackageJson } from "./utils/assertions.js";
import { buildFixture } from "./utils/build-fixture.js";
import { test } from "./utils/test-fixture.js";

describe("DTS Bundling E2E", () => {
	describe("single-entry fixture", () => {
		test("should generate bundled index.d.ts", async ({ result }) => {
			result.value = await buildFixture("single-entry");

			assertBuildSucceeded(result.value);
			assertOutputFile(result.value, "index.d.ts", {
				exists: true,
				contains: [
					"export declare function add",
					"export declare function subtract",
					"export declare interface CalculatorOptions",
				],
			});
			assertPackageJson(result.value, {
				hasExport: ".",
				hasTypes: ".",
				hasFile: "index.d.ts",
			});
		});

		test("should generate index.js", async ({ result }) => {
			result.value = await buildFixture("single-entry");

			assertBuildSucceeded(result.value);
			assertOutputFile(result.value, "index.js", {
				exists: true,
				contains: ["function add", "function subtract"],
			});
		});
	});

	describe("multi-entry fixture", () => {
		test("should generate bundled .d.ts for ALL entry points", async ({ result }) => {
			result.value = await buildFixture("multi-entry");

			assertBuildSucceeded(result.value);

			// Main entry - index.d.ts
			assertOutputFile(result.value, "index.d.ts", {
				exists: true,
				contains: [
					"export declare function greet",
					"export declare function createUser",
					"export declare interface User",
				],
			});

			// Secondary entry - utils.d.ts
			assertOutputFile(result.value, "utils.d.ts", {
				exists: true,
				contains: [
					"export declare function formatName",
					"export declare function capitalize",
					"export declare function truncate",
				],
			});

			// Secondary entry - types.d.ts
			assertOutputFile(result.value, "types.d.ts", {
				exists: true,
				contains: [
					"export declare interface User",
					"export declare type Status",
					"export declare interface Result",
					"export declare interface Config",
				],
			});
		});

		test("should have correct package.json exports with types for all entries", async ({ result }) => {
			result.value = await buildFixture("multi-entry");

			assertBuildSucceeded(result.value);

			assertPackageJson(result.value, { hasExport: ".", hasTypes: "." });
			assertPackageJson(result.value, { hasExport: "./utils", hasTypes: "./utils" });
			assertPackageJson(result.value, { hasExport: "./types", hasTypes: "./types" });

			assertPackageJson(result.value, { hasFile: "index.d.ts" });
			assertPackageJson(result.value, { hasFile: "utils.d.ts" });
			assertPackageJson(result.value, { hasFile: "types.d.ts" });
		});

		test("should generate .js files for all entry points", async ({ result }) => {
			result.value = await buildFixture("multi-entry");

			assertBuildSucceeded(result.value);

			assertOutputFile(result.value, "index.js", { exists: true });
			assertOutputFile(result.value, "utils.js", { exists: true });
			assertOutputFile(result.value, "types.js", { exists: true });
		});
	});

	describe("with-bin fixture", () => {
		test("should generate index.d.ts but NOT bin .d.ts", async ({ result }) => {
			result.value = await buildFixture("with-bin");

			assertBuildSucceeded(result.value);

			assertOutputFile(result.value, "index.d.ts", {
				exists: true,
				contains: ["export declare function runCommand", "export declare function parseArgs"],
			});

			assertOutputFile(result.value, "bin/my-cli.d.ts", { exists: false });
			assertOutputFile(result.value, "bin-my-cli.d.ts", { exists: false });
		});

		test("should generate bin JS file with shebang", async ({ result }) => {
			result.value = await buildFixture("with-bin");

			assertBuildSucceeded(result.value);

			assertOutputFile(result.value, "bin/my-cli.js", {
				exists: true,
				matches: /^#!\/usr\/bin\/env node/,
			});
		});

		test("should not include bin .d.ts in files array", async ({ result }) => {
			result.value = await buildFixture("with-bin");

			assertBuildSucceeded(result.value);

			assertPackageJson(result.value, { hasFile: "index.d.ts" });
			assertPackageJson(result.value, { notHasFile: "bin/my-cli.d.ts" });
		});

		test("should set correct bin path in package.json", async ({ result }) => {
			result.value = await buildFixture("with-bin");

			assertBuildSucceeded(result.value);

			assertPackageJson(result.value, {
				fieldEquals: {
					bin: { "my-cli": "./bin/my-cli.js" },
				},
			});
		});
	});

	describe("with-bin dual format fixture", () => {
		test("should only compile bin for primary format and prefix bin path", async ({ result }) => {
			result.value = await buildFixture("with-bin", {
				config: {
					builderOptions: {
						format: ["esm", "cjs"],
						dtsBundledPackages: [],
					},
				},
			});

			assertBuildSucceeded(result.value);

			// Bin JS should exist in primary format dir (esm)
			assertOutputFile(result.value, "esm/bin/my-cli.js", {
				exists: true,
				matches: /^#!\/usr\/bin\/env node/,
			});

			// Bin JS should NOT exist in secondary format dir (cjs)
			assertOutputFile(result.value, "cjs/bin/my-cli.js", { exists: false });
			assertOutputFile(result.value, "cjs/bin/my-cli.cjs", { exists: false });

			// package.json bin should point to the format-prefixed path
			const pkgContent = result.value.outputs.get("package.json");
			expect(pkgContent).toBeDefined();
			if (!pkgContent) return;
			const pkg = JSON.parse(pkgContent);
			expect(pkg.bin).toEqual({
				"my-cli": "./esm/bin/my-cli.js",
			});
		});
	});
});
