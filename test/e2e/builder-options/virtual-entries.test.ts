import {
	assertBuildSucceeded,
	assertOutputFile,
	assertPackageJson,
	buildFixture,
	describe,
	expect,
	test,
} from "../utils/index.js";

describe("NodeLibraryBuilder virtualEntries option E2E", () => {
	describe("basic virtual entry", () => {
		test("should bundle virtual entry with CJS format", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				target: "npm",
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

		test("should NOT generate .d.ts for virtual entries", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				target: "npm",
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

			assertBuildSucceeded(result.value);
			// No .d.ts should be generated for virtual entries
			assertOutputFile(result.value, "pnpmfile.d.ts", { exists: false });
		});

		test("should include virtual entries in files array", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				target: "npm",
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

			assertBuildSucceeded(result.value);
			assertPackageJson(result.value, { hasFile: "pnpmfile.cjs" });
		});

		test("should NOT add virtual entries to package.json exports", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				target: "npm",
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

			assertBuildSucceeded(result.value);
			// Virtual entries should NOT appear in exports
			const packageJsonContent = result.value.outputs.get("package.json");
			expect(packageJsonContent).toBeDefined();
			if (!packageJsonContent) return;
			const packageJson = JSON.parse(packageJsonContent);
			const exports = packageJson.exports as Record<string, unknown>;

			// Should not have ./pnpmfile.cjs or ./pnpmfile export
			expect(exports["./pnpmfile.cjs"]).toBeUndefined();
			expect(exports["./pnpmfile"]).toBeUndefined();
		});
	});

	describe("format inheritance", () => {
		test("should inherit format from top-level when not specified", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				target: "npm",
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
				target: "npm",
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
				target: "npm",
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

	describe("mixed regular and virtual entries", () => {
		test("should build both regular and virtual entries together", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				target: "npm",
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

			assertBuildSucceeded(result.value);
			// Regular entries should have types
			assertOutputFile(result.value, "index.js", { exists: true });
			assertOutputFile(result.value, "index.d.ts", { exists: true });
			// Virtual entry should not have types
			assertOutputFile(result.value, "pnpmfile.cjs", { exists: true });
			assertOutputFile(result.value, "pnpmfile.d.ts", { exists: false });
		});
	});
});
