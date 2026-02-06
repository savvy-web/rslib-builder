import { cpus } from "node:os";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Detect GitHub Actions environment.
 */
const isGitHubActions = process.env.GITHUB_ACTIONS === "true" || process.env.GITHUB_ACTIONS === "1";

/**
 * Calculate safe thread count for parallel e2e tests.
 * Uses half of available CPUs (min 1, max 8) to leave headroom for build processes.
 */
const e2eThreadCount = Math.max(1, Math.min(8, Math.floor(cpus().length / 2)));

/**
 * Configure reporters based on environment.
 * - GitHub Actions: Use github-actions reporter for annotations + default for output
 * - Local: Use default reporter
 */
const reporters = isGitHubActions ? ["default", "github-actions"] : ["default"];

/**
 * Shared resolve configuration for all projects
 */
const sharedResolve = {
	alias: {
		"#utils": fileURLToPath(new URL("./src/rslib/plugins/utils", import.meta.url)),
		"#types": fileURLToPath(new URL("./src/types", import.meta.url)),
	},
	extensions: [".ts", ".js", ".json"],
};

/**
 * Vitest configuration with workspace projects for @savvy-web/rslib-builder
 *
 * Projects:
 * - unit: Fast unit tests with coverage (src/**\/*.test.ts)
 * - e2e: End-to-end integration tests (test/e2e/**\/*.test.ts)
 *
 * Usage:
 * - `pnpm test` - Run unit tests (via turbo, ensures typecheck first)
 * - `pnpm test:e2e` - Run e2e tests (via turbo, ensures build first)
 * - `pnpm test:all` - Run all tests (via turbo, ensures build first)
 *
 * @see https://vitest.dev/guide/workspace
 */
export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		// Use github-actions reporter in CI for PR annotations
		reporters,
		// Disable colors in GitHub Actions for cleaner logs
		...(isGitHubActions && { color: false }),
		// Coverage settings (only apply to unit tests, but must be at root level)
		coverage: {
			enabled: true,
			provider: "v8",
			reporter: ["text", "text-summary", "html", "lcov"],
			include: ["src/**/*.ts"],
			exclude: [
				"**/*.test.ts",
				"**/__test__/**",
				"**/types/**",
				"**/*.d.ts",
				"**/tsconfig/**",
				"**/cli/**",
				"**/fake/**",
				"**/shared/**",
			],
			thresholds: {
				perFile: true,
				statements: 85,
				branches: 85,
				functions: 85,
				lines: 85,
			},
		},
		// Define workspace projects
		projects: [
			// Unit tests project
			{
				extends: true,
				test: {
					name: "unit",
					include: ["src/**/*.test.ts"],
				},
				resolve: sharedResolve,
			},
			// E2E tests project - parallel execution enabled via isolated fixture copies
			{
				extends: true,
				test: {
					name: "e2e",
					include: ["test/e2e/**/*.test.ts"],
					testTimeout: 120000,
					hookTimeout: 60000,
					// Limit concurrent tests based on available CPUs
					maxConcurrency: e2eThreadCount,
				},
				resolve: sharedResolve,
			},
		],
	},
	resolve: sharedResolve,
});
