import { afterAll, beforeAll, describe, it } from "vitest";
import {
	assertApiModelFile,
	assertBuildSucceeded,
	assertOutputFile,
	assertPackageJson,
	assertResolvedTsconfig,
	assertTsDocMetadata,
} from "../utils/assertions.js";
import type { BuildFixtureResult } from "../utils/build-fixture.js";
import { buildFixture } from "../utils/build-fixture.js";
import { test } from "../utils/test-fixture.js";

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

	describe("dev target", () => {
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
	});

	describe("npm target defaults", () => {
		let result: BuildFixtureResult;

		beforeAll(async () => {
			result = await buildFixture("options-testing", {
				target: "npm",
				config: { builderOptions: {} },
			});
		});

		afterAll(async () => {
			await result?.cleanup();
		});

		it("should generate API model for npm target", () => {
			assertBuildSucceeded(result);
			assertApiModelFile(result, { exists: true });
			assertTsDocMetadata(result, { exists: true });
			assertResolvedTsconfig(result, { exists: true });
		});

		it("should exclude api model and tsconfig from files array", () => {
			assertBuildSucceeded(result);
			assertPackageJson(result, { hasFile: "!options-testing.api.json" });
			assertPackageJson(result, { hasFile: "!tsconfig.json" });
			assertPackageJson(result, { hasFile: "tsdoc-metadata.json" });
		});

		it("should generate .d.ts for all exports", () => {
			assertBuildSucceeded(result);
			assertOutputFile(result, "index.d.ts", { exists: true });
			assertOutputFile(result, "index.js", { exists: true });
			assertOutputFile(result, "types.d.ts", { exists: true });
			assertOutputFile(result, "types.js", { exists: true });
			assertPackageJson(result, { hasExport: ".", hasTypes: "." });
			assertPackageJson(result, { hasExport: "./types", hasTypes: "./types" });
		});
	});

	describe("transform callback", () => {
		test("should call transform function to modify package.json", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				target: "npm",
				config: {
					builderOptions: {
						transform: ({ target, pkg }) => {
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
						transform: ({ pkg }) => {
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
						transform: ({ pkg }) => {
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
