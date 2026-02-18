import { describe, expect } from "vitest";
import { assertBuildFailed, assertBuildOutput, assertBuildSucceeded } from "../utils/assertions.js";
import { buildFixture } from "../utils/build-fixture.js";
import { test } from "../utils/test-fixture.js";

describe("NodeLibraryBuilder TSDoc Lint Options E2E", () => {
	describe("lint enabled (default) with valid TSDoc", () => {
		test("should succeed when all TSDoc comments are valid", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				config: { builderOptions: {} },
			});

			assertBuildSucceeded(result.value);
			assertBuildOutput(result.value, {
				stdoutContains: "Validating TSDoc comments",
			});
		});
	});

	describe("lint disabled", () => {
		test("should skip lint validation when apiModel.tsdoc.lint is false", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				config: {
					builderOptions: {
						apiModel: {
							tsdoc: {
								lint: false,
							},
						},
					},
				},
			});

			assertBuildSucceeded(result.value);
			assertBuildOutput(result.value, {
				stdoutNotContains: "Validating TSDoc comments",
			});
		});

		test("should skip lint validation when apiModel is false", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				config: {
					builderOptions: {
						apiModel: false,
					},
				},
			});

			assertBuildSucceeded(result.value);
			assertBuildOutput(result.value, {
				stdoutNotContains: "Validating TSDoc comments",
			});
		});
	});

	describe("lint with onError: warn", () => {
		test("should log warnings but continue build when onError is warn", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				config: {
					builderOptions: {
						apiModel: {
							tsdoc: {
								lint: {
									onError: "warn",
									include: ["src/bad-docs.ts"],
								},
							},
						},
					},
				},
			});

			assertBuildSucceeded(result.value);
			assertBuildOutput(result.value, {
				stdoutContains: "tsdoc-lint",
			});
		});
	});

	describe("lint with onError: error", () => {
		test("should log errors but continue build when onError is error", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				config: {
					builderOptions: {
						apiModel: {
							tsdoc: {
								lint: {
									onError: "error",
									include: ["src/bad-docs.ts"],
								},
							},
						},
					},
				},
			});

			assertBuildSucceeded(result.value);
			assertBuildOutput(result.value, {
				stdoutContains: "tsdoc-lint",
			});
		});
	});

	describe("lint with onError: throw", () => {
		test("should fail build when onError is throw and there are lint errors", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				config: {
					builderOptions: {
						apiModel: {
							tsdoc: {
								lint: {
									onError: "throw",
									include: ["src/bad-docs.ts"],
								},
							},
						},
					},
				},
			});

			assertBuildFailed(result.value);

			const combinedOutput = result.value.stdout + result.value.stderr;
			expect(combinedOutput).toContain("TSDoc validation failed");
		});
	});

	describe("lint with custom include patterns", () => {
		test("should only lint files matching include patterns", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				config: {
					builderOptions: {
						apiModel: {
							tsdoc: {
								lint: {
									include: ["src/index.ts", "src/types.ts"],
								},
							},
						},
					},
				},
			});

			assertBuildSucceeded(result.value);
		});
	});

	describe("lint inherits tsdoc config from parent", () => {
		test("should use parent tsdoc tagDefinitions for lint validation", async ({ result }) => {
			result.value = await buildFixture("options-testing", {
				config: {
					builderOptions: {
						apiModel: {
							tsdoc: {
								tagDefinitions: [{ tagName: "@invalidTag", syntaxKind: "block" }],
								lint: {
									onError: "throw",
									include: ["src/bad-docs.ts"],
									persistConfig: false,
								},
							},
						},
					},
				},
			});

			assertBuildOutput(result.value, {
				stdoutContains: "Validating TSDoc comments",
			});
		});
	});
});
