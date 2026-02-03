import { test as baseTest } from "vitest";
import type { BuildFixtureResult } from "./build-fixture.js";

/**
 * Container for build result that allows cleanup tracking.
 */
export interface ResultContainer {
	/** The build result, or null if not yet set */
	value: BuildFixtureResult | null;
}

/**
 * Context provided to tests using the fixture.
 */
export interface FixtureContext {
	/** Container for build result - set result.value to enable automatic cleanup */
	result: ResultContainer;
}

/**
 * Extended test with automatic cleanup of build results.
 *
 * @remarks
 * Each test gets an isolated copy of the fixture, so no backup/restore is needed.
 * Just set result.value to your build result and cleanup happens automatically.
 *
 * @example
 * ```typescript
 * import { describe, test, buildFixture, assertBuildSucceeded } from "./utils/index.js";
 *
 * describe("My tests", () => {
 *   test("my test", async ({ result }) => {
 *     result.value = await buildFixture("options-testing", {
 *       config: { builderOptions: {} }
 *     });
 *     assertBuildSucceeded(result.value);
 *   });
 * });
 * ```
 */
export const test = baseTest.extend<FixtureContext>({
	result: async (_, use) => {
		// Create mutable container for result
		const container: ResultContainer = { value: null };

		// Provide container to test
		await use(container);

		// Cleanup: remove isolated fixture copy
		if (container.value) {
			await container.value.cleanup();
		}
	},
});

export { afterEach, beforeEach, describe, expect } from "vitest";
