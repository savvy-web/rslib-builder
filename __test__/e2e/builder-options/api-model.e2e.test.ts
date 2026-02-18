import { describe } from "vitest";
import {
	assertApiModelFile,
	assertBuildFailed,
	assertBuildOutput,
	assertBuildSucceeded,
	assertOutputFile,
	assertPackageJson,
	assertResolvedTsconfig,
	assertTsDocMetadata,
} from "../utils/assertions.js";
import { buildFixture } from "../utils/build-fixture.js";
import { test } from "../utils/test-fixture.js";

describe("NodeLibraryBuilder apiModel Options E2E", () => {
	describe("apiModel: false", () => {
		test("should not generate API model, tsdoc-metadata, or tsconfig when apiModel is disabled", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				config: {
					builderOptions: {
						apiModel: false,
					},
				},
			});

			assertBuildSucceeded(result.value);
			assertApiModelFile(result.value, { exists: false });
			assertTsDocMetadata(result.value, { exists: false });
			assertResolvedTsconfig(result.value, { exists: false });
			assertOutputFile(result.value, "index.d.ts", { exists: true });
		});
	});

	describe("apiModel: true (default)", () => {
		test("should generate API model with default naming", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				config: {
					builderOptions: {
						apiModel: true,
					},
				},
			});

			assertBuildSucceeded(result.value);
			assertApiModelFile(result.value, { exists: true, filename: "options-testing.api.json" });
			assertTsDocMetadata(result.value, { exists: true });
			assertResolvedTsconfig(result.value, { exists: true });
			assertPackageJson(result.value, { notHasFile: "options-testing.api.json" });
			assertPackageJson(result.value, { hasFile: "tsdoc-metadata.json" });
		});

		test("should generate API model with implicit defaults when builderOptions is empty", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				config: { builderOptions: {} },
			});

			assertBuildSucceeded(result.value);
			assertApiModelFile(result.value, { exists: true });
			assertTsDocMetadata(result.value, { exists: true });
		});
	});

	describe("apiModel with custom filename", () => {
		test("should use custom filename for API model", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				config: {
					builderOptions: {
						apiModel: {
							filename: "custom-api-model.api.json",
						},
					},
				},
			});

			assertBuildSucceeded(result.value);
			assertApiModelFile(result.value, { exists: true, filename: "custom-api-model.api.json" });
			assertOutputFile(result.value, "options-testing.api.json", { exists: false });
		});
	});

	describe("apiModel with tsdocMetadata disabled", () => {
		test("should generate API model but not tsdoc-metadata when tsdocMetadata is false", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				config: {
					builderOptions: {
						apiModel: {
							tsdocMetadata: false,
						},
					},
				},
			});

			assertBuildSucceeded(result.value);
			assertApiModelFile(result.value, { exists: true });
			assertTsDocMetadata(result.value, { exists: false });
			assertResolvedTsconfig(result.value, { exists: true });
		});

		test("should use custom tsdoc-metadata filename when specified", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				config: {
					builderOptions: {
						apiModel: {
							tsdocMetadata: {
								filename: "custom-tsdoc-meta.json",
							},
						},
					},
				},
			});

			assertBuildSucceeded(result.value);
			assertTsDocMetadata(result.value, { exists: true, filename: "custom-tsdoc-meta.json" });
			assertTsDocMetadata(result.value, { exists: false, filename: "tsdoc-metadata.json" });
		});
	});

	describe("apiModel with custom tsdoc tags", () => {
		test("should accept custom tag definitions", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				config: {
					builderOptions: {
						apiModel: {
							tsdoc: {
								tagDefinitions: [{ tagName: "@customTag", syntaxKind: "block", allowMultiple: false }],
								lint: {
									persistConfig: false,
								},
							},
						},
					},
				},
			});

			assertBuildSucceeded(result.value);
			assertApiModelFile(result.value, { exists: true });
		});
	});

	describe("dev target should not generate API model", () => {
		test("should not generate API model for dev target", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				target: "dev",
				config: {
					builderOptions: {
						apiModel: true,
					},
				},
			});

			assertBuildSucceeded(result.value);
			assertApiModelFile(result.value, { exists: false });
			assertTsDocMetadata(result.value, { exists: false });
			assertOutputFile(result.value, "index.d.ts", { exists: true });
		});
	});

	describe("forgottenExports behavior", () => {
		// Types file with an internal type that will be used but not re-exported
		const internalTypesFile = `/**
 * Internal types - not meant to be exported from index.
 */
export interface InternalUser {
	/** User's unique identifier */
	id: string;
	/** User's display name */
	name: string;
}
`;

		// Index file that imports and uses InternalUser but doesn't re-export it
		// This creates a forgotten export scenario
		const indexWithForgottenExport = `/**
 * Test fixture with forgotten export.
 * @packageDocumentation
 */

import type { InternalUser } from "./internal-types.js";

/**
 * Gets the user name.
 * @param user - The user object
 * @returns The user's name
 * @public
 */
export function getUserName(user: InternalUser): string {
	return user.name;
}
`;

		test("should fail build in CI when forgotten exports are detected", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				config: {
					builderOptions: {
						apiModel: {
							tsdoc: {
								lint: false, // Disable lint to focus on forgotten exports
							},
						},
					},
				},
				sourceFiles: {
					"src/internal-types.ts": internalTypesFile,
					"src/index.ts": indexWithForgottenExport,
				},
				env: {
					CI: "true",
				},
			});

			assertBuildFailed(result.value);
			assertBuildOutput(result.value, {
				stderrContains: "Forgotten exports detected",
			});
		});

		test("should warn but succeed locally when forgotten exports are detected", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				config: {
					builderOptions: {
						apiModel: {
							tsdoc: {
								lint: false, // Disable lint to focus on forgotten exports
							},
						},
					},
				},
				sourceFiles: {
					"src/internal-types.ts": internalTypesFile,
					"src/index.ts": indexWithForgottenExport,
				},
				env: {
					CI: "", // Explicitly unset CI
					GITHUB_ACTIONS: "", // Explicitly unset GITHUB_ACTIONS
				},
			});

			assertBuildSucceeded(result.value);
			assertBuildOutput(result.value, {
				stderrContains: "Forgotten exports",
			});
		});

		test("should respect explicit forgottenExports: error option even without CI", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				config: {
					builderOptions: {
						apiModel: {
							forgottenExports: "error",
							tsdoc: {
								lint: false,
							},
						},
					},
				},
				sourceFiles: {
					"src/internal-types.ts": internalTypesFile,
					"src/index.ts": indexWithForgottenExport,
				},
				env: {
					CI: "",
					GITHUB_ACTIONS: "",
				},
			});

			assertBuildFailed(result.value);
			assertBuildOutput(result.value, {
				stderrContains: "Forgotten exports detected",
			});
		});

		test("should ignore forgotten exports when forgottenExports: ignore is set", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				config: {
					builderOptions: {
						apiModel: {
							forgottenExports: "ignore",
							tsdoc: {
								lint: false,
							},
						},
					},
				},
				sourceFiles: {
					"src/internal-types.ts": internalTypesFile,
					"src/index.ts": indexWithForgottenExport,
				},
				env: {
					CI: "true", // Even in CI, should not fail
				},
			});

			assertBuildSucceeded(result.value);
			assertBuildOutput(result.value, {
				stdoutNotContains: "Forgotten exports",
				stderrNotContains: "Forgotten exports",
			});
		});
	});
});
