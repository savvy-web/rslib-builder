import {
	assertApiModelFile,
	assertBuildSucceeded,
	assertOutputFile,
	assertPackageJson,
	assertResolvedTsconfig,
	assertTsDocMetadata,
	buildFixture,
	describe,
	test,
} from "../utils/index.js";

describe("NodeLibraryBuilder Build Options E2E", () => {
	describe("externals option", () => {
		test("should treat string externals as external dependencies", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				config: {
					builderOptions: {
						externals: ["external-package"],
					},
				},
			});

			assertBuildSucceeded(result.value);
			assertOutputFile(result.value, "index.js", { exists: true });
		});

		test("should support RegExp externals", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				config: {
					builderOptions: {
						externals: [/^@scope\/.*/],
					},
				},
			});

			assertBuildSucceeded(result.value);
		});

		test("should support mixed string and RegExp externals", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				config: {
					builderOptions: {
						externals: ["some-package", /^@other-scope\/.*/],
					},
				},
			});

			assertBuildSucceeded(result.value);
		});
	});

	describe("dtsBundledPackages option", () => {
		test("should accept dtsBundledPackages patterns", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				config: {
					builderOptions: {
						dtsBundledPackages: ["type-fest", "@types/*"],
					},
				},
			});

			assertBuildSucceeded(result.value);
			assertOutputFile(result.value, "index.d.ts", { exists: true });
		});

		test("should work with empty dtsBundledPackages array", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				config: {
					builderOptions: {
						dtsBundledPackages: [],
					},
				},
			});

			assertBuildSucceeded(result.value);
		});
	});

	describe("build target differences", () => {
		test("should generate source maps for dev target", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				target: "dev",
				config: { builderOptions: {} },
			});

			assertBuildSucceeded(result.value);
			assertOutputFile(result.value, "index.js", { exists: true });
			assertApiModelFile(result.value, { exists: false });
			assertOutputFile(result.value, "index.d.ts", { exists: true });
		});

		test("should generate API model for npm target", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				target: "npm",
				config: { builderOptions: {} },
			});

			assertBuildSucceeded(result.value);
			assertApiModelFile(result.value, { exists: true });
			assertTsDocMetadata(result.value, { exists: true });
			assertResolvedTsconfig(result.value, { exists: true });
		});

		test("npm target should exclude api model and tsconfig from files array", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				target: "npm",
				config: { builderOptions: {} },
			});

			assertBuildSucceeded(result.value);
			assertPackageJson(result.value, { hasFile: "!options-testing.api.json" });
			assertPackageJson(result.value, { hasFile: "!tsconfig.json" });
			assertPackageJson(result.value, { hasFile: "tsdoc-metadata.json" });
		});
	});

	describe("transform callback", () => {
		test("should call transform function to modify package.json", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				target: "npm",
				config: {
					builderOptions: {
						transform: ({ target, pkg }: { target: string; pkg: Record<string, unknown> }) => {
							pkg.customField = `built-for-${target}`;
							return pkg;
						},
					},
				},
			});

			assertBuildSucceeded(result.value);
			assertPackageJson(result.value, {
				fieldEquals: { customField: "built-for-npm" },
			});
		});

		test("should support removing fields via transform", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				target: "npm",
				config: {
					builderOptions: {
						transform: ({ pkg }: { pkg: Record<string, unknown> }) => {
							delete pkg.devDependencies;
							return pkg;
						},
					},
				},
			});

			assertBuildSucceeded(result.value);
			assertPackageJson(result.value, {
				fieldEquals: { devDependencies: undefined },
			});
		});
	});

	describe("multi-entry exports", () => {
		test("should generate .d.ts for all exports", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				config: { builderOptions: {} },
			});

			assertBuildSucceeded(result.value);
			assertOutputFile(result.value, "index.d.ts", { exists: true });
			assertOutputFile(result.value, "index.js", { exists: true });
			assertOutputFile(result.value, "types.d.ts", { exists: true });
			assertOutputFile(result.value, "types.js", { exists: true });
			assertPackageJson(result.value, { hasExport: ".", hasTypes: "." });
			assertPackageJson(result.value, { hasExport: "./types", hasTypes: "./types" });
		});
	});

	describe("combined options", () => {
		test("should work with multiple options combined", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				config: {
					builderOptions: {
						externals: ["some-external"],
						dtsBundledPackages: [],
						apiModel: {
							filename: "custom.api.json",
							tsdocMetadata: {
								filename: "custom-tsdoc.json",
							},
							tsdoc: {
								lint: false,
							},
						},
						transform: ({ pkg }: { pkg: Record<string, unknown> }) => {
							pkg.description = "Built with custom options";
							return pkg;
						},
					},
				},
			});

			assertBuildSucceeded(result.value);
			assertApiModelFile(result.value, { exists: true, filename: "custom.api.json" });
			assertTsDocMetadata(result.value, { exists: true, filename: "custom-tsdoc.json" });
			assertPackageJson(result.value, {
				fieldEquals: { description: "Built with custom options" },
			});
		});
	});
});
