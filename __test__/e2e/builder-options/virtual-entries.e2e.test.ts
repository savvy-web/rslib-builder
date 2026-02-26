import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertBuildSucceeded, assertOutputFile, assertPackageJson } from "../utils/assertions.js";
import type { BuildFixtureResult } from "../utils/build-fixture.js";
import { buildFixture } from "../utils/build-fixture.js";
import { test } from "../utils/test-fixture.js";

describe("NodeLibraryBuilder virtualEntries option E2E", () => {
	describe("basic virtual entry", () => {
		test("should bundle virtual entry with CJS format", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				mode: "npm",
				config: {
					builderOptions: {
						virtualEntries: {
							"pnpmfile.cjs": {
								source: "./src/pnpmfile.ts",
								format: "cjs",
							},
						},
					},
				},
				sourceFiles: {
					"src/pnpmfile.ts": `
/**
 * PNPM configuration file.
 */
export function readPackage(pkg: Record<string, unknown>) {
  return pkg;
}
`,
				},
			});

			assertBuildSucceeded(result.value);
			// Virtual entry should be bundled
			assertOutputFile(result.value, "pnpmfile.cjs", { exists: true });
		});
	});

	describe("pnpmfile virtual entry behavior", () => {
		let result: BuildFixtureResult;

		beforeAll(async () => {
			result = await buildFixture("options-testing", {
				mode: "npm",
				config: {
					builderOptions: {
						virtualEntries: {
							"pnpmfile.cjs": {
								source: "./src/pnpmfile.ts",
								format: "cjs",
							},
						},
					},
				},
				sourceFiles: {
					"src/pnpmfile.ts": `
export function readPackage(pkg: Record<string, unknown>) {
  return pkg;
}
`,
				},
			});
		});

		afterAll(async () => {
			await result?.cleanup();
		});

		it("should NOT generate .d.ts for virtual entries", () => {
			assertBuildSucceeded(result);
			// No .d.ts should be generated for virtual entries
			assertOutputFile(result, "pnpmfile.d.ts", { exists: false });
		});

		it("should include virtual entries in files array", () => {
			assertBuildSucceeded(result);
			assertPackageJson(result, { hasFile: "pnpmfile.cjs" });
		});

		it("should NOT add virtual entries to package.json exports", () => {
			assertBuildSucceeded(result);
			// Virtual entries should NOT appear in exports
			const packageJsonContent = result.outputs.get("package.json");
			expect(packageJsonContent).toBeDefined();
			if (!packageJsonContent) return;
			const packageJson = JSON.parse(packageJsonContent);
			const exports = packageJson.exports as Record<string, unknown>;

			// Should not have ./pnpmfile.cjs or ./pnpmfile export
			expect(exports["./pnpmfile.cjs"]).toBeUndefined();
			expect(exports["./pnpmfile"]).toBeUndefined();
		});

		it("should build both regular and virtual entries together", () => {
			assertBuildSucceeded(result);
			// Regular entries should have types
			assertOutputFile(result, "index.js", { exists: true });
			assertOutputFile(result, "index.d.ts", { exists: true });
			// Virtual entry should not have types
			assertOutputFile(result, "pnpmfile.cjs", { exists: true });
			assertOutputFile(result, "pnpmfile.d.ts", { exists: false });
		});
	});

	describe("format inheritance", () => {
		test("should inherit format from top-level when not specified", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				mode: "npm",
				config: {
					builderOptions: {
						format: "cjs",
						virtualEntries: {
							"helper.cjs": {
								source: "./src/helper.ts",
								// No format specified - should inherit "cjs" from top-level
							},
						},
					},
				},
				sourceFiles: {
					"src/helper.ts": `
export function helper() {
  return "helper";
}
`,
				},
			});

			assertBuildSucceeded(result.value);
			// Virtual entry should use inherited CJS format
			assertOutputFile(result.value, "helper.cjs", { exists: true });
		});

		test("should allow overriding inherited format per-entry", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				mode: "npm",
				config: {
					builderOptions: {
						format: "esm", // Top-level ESM
						virtualEntries: {
							"pnpmfile.cjs": {
								source: "./src/pnpmfile.ts",
								format: "cjs", // Override to CJS
							},
						},
					},
				},
				sourceFiles: {
					"src/pnpmfile.ts": `
export function readPackage(pkg: Record<string, unknown>) {
  return pkg;
}
`,
				},
			});

			assertBuildSucceeded(result.value);
			// Main entries should be ESM
			assertOutputFile(result.value, "index.js", { exists: true });
			// Virtual entry should be CJS (overridden)
			assertOutputFile(result.value, "pnpmfile.cjs", { exists: true });
		});
	});

	describe("multiple virtual entries", () => {
		test("should handle multiple virtual entries with different formats", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				mode: "npm",
				config: {
					builderOptions: {
						virtualEntries: {
							"pnpmfile.cjs": {
								source: "./src/pnpmfile.ts",
								format: "cjs",
							},
							"config.js": {
								source: "./src/config.ts",
								format: "esm",
							},
						},
					},
				},
				sourceFiles: {
					"src/pnpmfile.ts": `
export function readPackage(pkg: Record<string, unknown>) {
  return pkg;
}
`,
					"src/config.ts": `
export const config = { version: 1 };
`,
				},
			});

			assertBuildSucceeded(result.value);
			// Both virtual entries should be bundled
			assertOutputFile(result.value, "pnpmfile.cjs", { exists: true });
			assertOutputFile(result.value, "config.js", { exists: true });
			// Neither should have .d.ts
			assertOutputFile(result.value, "pnpmfile.d.ts", { exists: false });
			assertOutputFile(result.value, "config.d.ts", { exists: false });
			// Both should be in files array
			assertPackageJson(result.value, { hasFile: "pnpmfile.cjs" });
			assertPackageJson(result.value, { hasFile: "config.js" });
		});
	});
});
