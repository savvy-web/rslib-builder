import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertBuildSucceeded, assertOutputFile, assertPackageJson } from "./utils/assertions.js";
import type { BuildFixtureResult } from "./utils/build-fixture.js";
import { buildFixture } from "./utils/build-fixture.js";
import { test } from "./utils/test-fixture.js";

describe("DTS Bundling E2E", () => {
	describe("single-entry fixture", () => {
		let result: BuildFixtureResult;

		beforeAll(async () => {
			result = await buildFixture("single-entry");
		});

		afterAll(async () => {
			await result?.cleanup();
		});

		it("should generate bundled index.d.ts", () => {
			assertBuildSucceeded(result);
			assertOutputFile(result, "index.d.ts", {
				exists: true,
				contains: [
					"export declare function add",
					"export declare function subtract",
					"export declare interface CalculatorOptions",
				],
			});
			assertPackageJson(result, {
				hasExport: ".",
				hasTypes: ".",
				hasFile: "index.d.ts",
			});
		});

		it("should generate index.js", () => {
			assertBuildSucceeded(result);
			assertOutputFile(result, "index.js", {
				exists: true,
				contains: ["function add", "function subtract"],
			});
		});
	});

	describe("multi-entry fixture", () => {
		let result: BuildFixtureResult;

		beforeAll(async () => {
			result = await buildFixture("multi-entry");
		});

		afterAll(async () => {
			await result?.cleanup();
		});

		it("should generate bundled .d.ts for ALL entry points", () => {
			assertBuildSucceeded(result);

			// Main entry - index.d.ts
			assertOutputFile(result, "index.d.ts", {
				exists: true,
				contains: [
					"export declare function greet",
					"export declare function createUser",
					"export declare interface User",
				],
			});

			// Secondary entry - utils.d.ts
			assertOutputFile(result, "utils.d.ts", {
				exists: true,
				contains: [
					"export declare function formatName",
					"export declare function capitalize",
					"export declare function truncate",
				],
			});

			// Secondary entry - types.d.ts
			assertOutputFile(result, "types.d.ts", {
				exists: true,
				contains: [
					"export declare interface User",
					"export declare type Status",
					"export declare interface Result",
					"export declare interface Config",
				],
			});
		});

		it("should have correct package.json exports with types for all entries", () => {
			assertBuildSucceeded(result);

			assertPackageJson(result, { hasExport: ".", hasTypes: "." });
			assertPackageJson(result, { hasExport: "./utils", hasTypes: "./utils" });
			assertPackageJson(result, { hasExport: "./types", hasTypes: "./types" });

			assertPackageJson(result, { hasFile: "index.d.ts" });
			assertPackageJson(result, { hasFile: "utils.d.ts" });
			assertPackageJson(result, { hasFile: "types.d.ts" });
		});

		it("should generate .js files for all entry points", () => {
			assertBuildSucceeded(result);

			assertOutputFile(result, "index.js", { exists: true });
			assertOutputFile(result, "utils.js", { exists: true });
			assertOutputFile(result, "types.js", { exists: true });
		});
	});

	describe("with-bin fixture", () => {
		let result: BuildFixtureResult;

		beforeAll(async () => {
			result = await buildFixture("with-bin");
		});

		afterAll(async () => {
			await result?.cleanup();
		});

		it("should generate index.d.ts but NOT bin .d.ts", () => {
			assertBuildSucceeded(result);

			assertOutputFile(result, "index.d.ts", {
				exists: true,
				contains: ["export declare function runCommand", "export declare function parseArgs"],
			});

			assertOutputFile(result, "bin/my-cli.d.ts", { exists: false });
			assertOutputFile(result, "bin-my-cli.d.ts", { exists: false });
		});

		it("should generate bin JS file with shebang", () => {
			assertBuildSucceeded(result);

			assertOutputFile(result, "bin/my-cli.js", {
				exists: true,
				matches: /^#!\/usr\/bin\/env node/,
			});
		});

		it("should not include bin .d.ts in files array", () => {
			assertBuildSucceeded(result);

			assertPackageJson(result, { hasFile: "index.d.ts" });
			assertPackageJson(result, { notHasFile: "bin/my-cli.d.ts" });
		});

		it("should set correct bin path in package.json", () => {
			assertBuildSucceeded(result);

			assertPackageJson(result, {
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
