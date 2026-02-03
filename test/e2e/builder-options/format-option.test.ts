import {
	assertBuildSucceeded,
	assertOutputFile,
	assertPackageJson,
	assertResolvedTsconfig,
	buildFixture,
	describe,
	expect,
	test,
} from "../utils/index.js";

describe("NodeLibraryBuilder format option E2E", () => {
	describe("default ESM format", () => {
		test("should set package.json type to module for default format", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				target: "npm",
				config: {
					builderOptions: {},
				},
			});

			assertBuildSucceeded(result.value);
			assertPackageJson(result.value, {
				fieldEquals: { type: "module" },
			});
		});

		test("should output .js files for ESM format", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				target: "npm",
				config: {
					builderOptions: {},
				},
			});

			assertBuildSucceeded(result.value);
			assertOutputFile(result.value, "index.js", { exists: true });
			assertOutputFile(result.value, "index.cjs", { exists: false });
		});

		test("should emit resolved tsconfig without CJS overrides for ESM format", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				target: "npm",
				config: {
					builderOptions: {},
				},
			});

			assertBuildSucceeded(result.value);
			assertResolvedTsconfig(result.value, { exists: true });

			// Parse the resolved tsconfig and verify it doesn't have CJS overrides
			const tsconfigContent = result.value.outputs.get("tsconfig.json");
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
				target: "npm",
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
		test("should set package.json type to commonjs for cjs format", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				target: "npm",
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

		test("should output .cjs files for CJS format", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				target: "npm",
				config: {
					builderOptions: {
						format: "cjs",
					},
				},
			});

			assertBuildSucceeded(result.value);
			assertOutputFile(result.value, "index.cjs", { exists: true });
			assertOutputFile(result.value, "index.js", { exists: false });
		});

		test("should emit resolved tsconfig with CJS module settings", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				target: "npm",
				config: {
					builderOptions: {
						format: "cjs",
					},
				},
			});

			assertBuildSucceeded(result.value);
			assertResolvedTsconfig(result.value, { exists: true });

			// Parse the resolved tsconfig and verify module settings
			const tsconfigContent = result.value.outputs.get("tsconfig.json");
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
				target: "dev",
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
				target: "dev",
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
