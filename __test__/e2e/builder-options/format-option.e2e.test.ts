import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	assertBuildSucceeded,
	assertOutputFile,
	assertPackageJson,
	assertResolvedTsconfig,
} from "../utils/assertions.js";
import type { BuildFixtureResult } from "../utils/build-fixture.js";
import { buildFixture } from "../utils/build-fixture.js";
import { test } from "../utils/test-fixture.js";

describe("NodeLibraryBuilder format option E2E", () => {
	describe("default ESM format", () => {
		let result: BuildFixtureResult;

		beforeAll(async () => {
			result = await buildFixture("options-testing", {
				mode: "npm",
				config: {
					builderOptions: {},
				},
			});
		});

		afterAll(async () => {
			await result?.cleanup();
		});

		it("should set package.json type to module for default format", () => {
			assertBuildSucceeded(result);
			assertPackageJson(result, {
				fieldEquals: { type: "module" },
			});
		});

		it("should output .js files for ESM format", () => {
			assertBuildSucceeded(result);
			assertOutputFile(result, "index.js", { exists: true });
			assertOutputFile(result, "index.cjs", { exists: false });
		});

		it("should emit resolved tsconfig without CJS overrides for ESM format", () => {
			assertBuildSucceeded(result);
			assertResolvedTsconfig(result, { exists: true });

			// Parse the resolved tsconfig and verify it doesn't have CJS overrides
			const tsconfigContent = result.outputs.get("tsconfig.json");
			expect(tsconfigContent).toBeDefined();
			if (!tsconfigContent) return;
			const tsconfig = JSON.parse(tsconfigContent);

			// ESM should NOT have the CJS-specific settings
			// (module may be esnext, nodenext, etc. depending on base config - just verify it's NOT "commonjs")
			expect(tsconfig.compilerOptions.module).not.toBe("commonjs");
			expect(tsconfig.compilerOptions.moduleResolution).not.toBe("node10");
		});
	});

	describe("explicit ESM format", () => {
		test("should set package.json type to module for esm format", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				mode: "npm",
				config: {
					builderOptions: {
						format: "esm",
					},
				},
			});

			assertBuildSucceeded(result.value);
			assertPackageJson(result.value, {
				fieldEquals: { type: "module" },
			});
		});
	});

	describe("CJS format", () => {
		let result: BuildFixtureResult;

		beforeAll(async () => {
			result = await buildFixture("options-testing", {
				mode: "npm",
				config: {
					builderOptions: {
						format: "cjs",
					},
				},
			});
		});

		afterAll(async () => {
			await result?.cleanup();
		});

		it("should set package.json type to commonjs for cjs format", () => {
			assertBuildSucceeded(result);
			assertPackageJson(result, {
				fieldEquals: { type: "commonjs" },
			});
		});

		it("should output .cjs files for CJS format", () => {
			assertBuildSucceeded(result);
			assertOutputFile(result, "index.cjs", { exists: true });
			assertOutputFile(result, "index.js", { exists: false });
		});

		it("should emit resolved tsconfig with CJS module settings", () => {
			assertBuildSucceeded(result);
			assertResolvedTsconfig(result, { exists: true });

			// Parse the resolved tsconfig and verify module settings
			const tsconfigContent = result.outputs.get("tsconfig.json");
			expect(tsconfigContent).toBeDefined();
			if (!tsconfigContent) return;
			const tsconfig = JSON.parse(tsconfigContent);

			// CJS should use commonjs module and node10 resolution
			expect(tsconfig.compilerOptions.module).toBe("commonjs");
			expect(tsconfig.compilerOptions.moduleResolution).toBe("node10");
			expect(tsconfig.compilerOptions.esModuleInterop).toBe(true);
		});
	});

	describe("format with dev target", () => {
		test("should set package.json type to module for dev target with esm format", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				mode: "dev",
				config: {
					builderOptions: {
						format: "esm",
					},
				},
			});

			assertBuildSucceeded(result.value);
			assertPackageJson(result.value, {
				fieldEquals: { type: "module" },
			});
		});

		test("should set package.json type to commonjs for dev target with cjs format", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				mode: "dev",
				config: {
					builderOptions: {
						format: "cjs",
					},
				},
			});

			assertBuildSucceeded(result.value);
			assertPackageJson(result.value, {
				fieldEquals: { type: "commonjs" },
			});
		});
	});
});
