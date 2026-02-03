import { afterEach, describe, it } from "vitest";
import type { BuildFixtureResult } from "./utils/index.js";
import { assertBuildSucceeded, assertOutputFile, assertPackageJson, buildFixture } from "./utils/index.js";

describe("DTS Bundling E2E", () => {
	let result: BuildFixtureResult | null = null;

	afterEach(async () => {
		if (result) {
			await result.cleanup();
			result = null;
		}
	});

	describe("single-entry fixture", () => {
		it("should generate bundled index.d.ts", async () => {
			result = await buildFixture("single-entry");

			assertBuildSucceeded(result);

			// Check that index.d.ts exists and has correct content
			// Note: API Extractor uses "export declare interface" format
			assertOutputFile(result, "index.d.ts", {
				exists: true,
				contains: [
					"export declare function add",
					"export declare function subtract",
					"export declare interface CalculatorOptions",
				],
			});

			// Check package.json has correct exports
			assertPackageJson(result, {
				hasExport: ".",
				hasTypes: ".",
				hasFile: "index.d.ts",
			});
		});

		it("should generate index.js", async () => {
			result = await buildFixture("single-entry");

			assertBuildSucceeded(result);

			assertOutputFile(result, "index.js", {
				exists: true,
				contains: ["function add", "function subtract"],
			});
		});
	});

	describe("multi-entry fixture", () => {
		it("should generate bundled .d.ts for ALL entry points", async () => {
			result = await buildFixture("multi-entry");

			assertBuildSucceeded(result);

			// Main entry - index.d.ts
			// Note: API Extractor inlines referenced types, so User is declared directly
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
			// Note: API Extractor uses "export declare interface/type" format
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

		it("should have correct package.json exports with types for all entries", async () => {
			result = await buildFixture("multi-entry");

			assertBuildSucceeded(result);

			// All exports should have types field
			assertPackageJson(result, { hasExport: ".", hasTypes: "." });
			assertPackageJson(result, { hasExport: "./utils", hasTypes: "./utils" });
			assertPackageJson(result, { hasExport: "./types", hasTypes: "./types" });

			// All .d.ts files should be in files array
			assertPackageJson(result, { hasFile: "index.d.ts" });
			assertPackageJson(result, { hasFile: "utils.d.ts" });
			assertPackageJson(result, { hasFile: "types.d.ts" });
		});

		it("should generate .js files for all entry points", async () => {
			result = await buildFixture("multi-entry");

			assertBuildSucceeded(result);

			assertOutputFile(result, "index.js", { exists: true });
			assertOutputFile(result, "utils.js", { exists: true });
			assertOutputFile(result, "types.js", { exists: true });
		});
	});

	describe("with-bin fixture", () => {
		it("should generate index.d.ts but NOT bin .d.ts", async () => {
			result = await buildFixture("with-bin");

			assertBuildSucceeded(result);

			// Main entry should have .d.ts
			assertOutputFile(result, "index.d.ts", {
				exists: true,
				contains: ["export declare function runCommand", "export declare function parseArgs"],
			});

			// Bin entry should NOT have .d.ts (bin entries are skipped)
			assertOutputFile(result, "bin/my-cli.d.ts", { exists: false });
			assertOutputFile(result, "bin-my-cli.d.ts", { exists: false });
		});

		it("should generate bin JS file with shebang", async () => {
			result = await buildFixture("with-bin");

			assertBuildSucceeded(result);

			// Bin file should exist and have shebang
			assertOutputFile(result, "bin/my-cli.js", {
				exists: true,
				matches: /^#!\/usr\/bin\/env node/,
			});
		});

		it("should not include bin .d.ts in files array", async () => {
			result = await buildFixture("with-bin");

			assertBuildSucceeded(result);

			assertPackageJson(result, { hasFile: "index.d.ts" });
			assertPackageJson(result, { notHasFile: "bin/my-cli.d.ts" });
		});
	});
});
