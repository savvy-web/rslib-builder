import { afterAll, beforeAll, describe, it } from "vitest";
import { assertBuildSucceeded, assertOutputFile, assertPackageJson } from "./utils/assertions.js";
import type { BuildFixtureResult } from "./utils/build-fixture.js";
import { buildFixture } from "./utils/build-fixture.js";
import { test } from "./utils/test-fixture.js";

describe("RSPressPluginBuilder E2E", () => {
	describe("plugin + runtime build (npm mode)", () => {
		let result: BuildFixtureResult;

		beforeAll(async () => {
			result = await buildFixture("rspress-plugin", {
				mode: "npm",
				config: {
					rspressBuilderOptions: {},
				},
			});
		}, 120000);

		afterAll(async () => {
			await result?.cleanup();
		});

		it("should succeed", () => {
			assertBuildSucceeded(result);
		});

		it("should produce plugin JS output", () => {
			assertOutputFile(result, "index.js", { exists: true });
		});

		it("should produce plugin DTS output", () => {
			assertOutputFile(result, "index.d.ts", { exists: true });
		});

		it("should produce runtime JS output", () => {
			assertOutputFile(result, "runtime/index.js", { exists: true });
		});

		// TODO: Runtime DTS lands at runtime/runtime/index.d.ts (double-nested)
		// because the runtime lib's distPath.root is already dist/<mode>/runtime/
		// and DtsPlugin creates output relative to that. Needs investigation in
		// a real monorepo consumer setup. See follow-up issue.
		it("should produce runtime DTS output", () => {
			assertOutputFile(result, "runtime/runtime/index.d.ts", { exists: true });
		});

		it("should produce runtime CSS output", () => {
			assertOutputFile(result, "runtime/index.css", { exists: true });
		});

		it("should have correct package.json exports", () => {
			assertPackageJson(result, { hasExport: "." });
			assertPackageJson(result, { hasExport: "./runtime" });
			assertPackageJson(result, { hasTypes: "." });
			assertPackageJson(result, { hasTypes: "./runtime" });
		});
	});

	describe("plugin-only build (runtime disabled)", () => {
		test("should build plugin without runtime JS or CSS when runtime: false", async ({ result }) => {
			result.value = await buildFixture("rspress-plugin", {
				mode: "npm",
				config: {
					rspressBuilderOptions: {
						runtime: false,
					},
				},
			});

			assertBuildSucceeded(result.value);
			assertOutputFile(result.value, "index.js", { exists: true });
			assertOutputFile(result.value, "index.d.ts", { exists: true });
			// Runtime JS and CSS should not be produced (no runtime lib)
			assertOutputFile(result.value, "runtime/index.js", { exists: false });
			assertOutputFile(result.value, "runtime/index.css", { exists: false });
		});
	});
});
