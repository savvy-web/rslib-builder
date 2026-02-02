import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for E2E tests
 * @see https://vitest.dev/config/
 */
export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["test/e2e/**/*.test.ts"],
		testTimeout: 120000,
		hookTimeout: 60000,
		// Run tests sequentially to avoid resource contention
		sequence: {
			concurrent: false,
		},
		// Disable coverage for e2e tests
		coverage: {
			enabled: false,
		},
	},
});
