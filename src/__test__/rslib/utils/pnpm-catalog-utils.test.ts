import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCatalogCache, getCatalog } from "#utils/pnpm-catalog-utils.js";
import { createMockStats } from "./test-types.js";

// Mock external dependencies
vi.mock("workspace-tools");
vi.mock("node:fs/promises", () => ({
	stat: vi.fn().mockRejectedValue(new Error("ENOENT")),
	readFile: vi.fn(),
}));
vi.mock("yaml", async (importOriginal) => {
	const actual = await importOriginal<typeof import("yaml")>();
	return {
		parse: vi.fn(actual.parse),
	};
});

import { readFile, stat } from "node:fs/promises";
// Static imports after mocks are set up
import { getWorkspaceRoot } from "workspace-tools";
import { parse } from "yaml";

describe("pnpm-catalog-utils", () => {
	describe("getCatalog", () => {
		beforeEach(() => {
			vi.clearAllMocks();
			clearCatalogCache();
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it("should handle ENOENT error when reading pnpm-workspace.yaml", async () => {
			vi.mocked(getWorkspaceRoot).mockReturnValue("/test/workspace");
			const enoentError = new Error("ENOENT: no such file or directory, open 'pnpm-workspace.yaml'");
			vi.mocked(stat).mockRejectedValue(enoentError);
			vi.mocked(readFile).mockRejectedValue(enoentError);

			const result = await getCatalog();

			expect(result).toEqual({});
		});

		it("should handle YAML parsing error when reading pnpm-workspace.yaml", async () => {
			vi.mocked(getWorkspaceRoot).mockReturnValue("/test/workspace");
			vi.mocked(stat).mockResolvedValue(createMockStats(new Date(123456789)));
			vi.mocked(readFile).mockResolvedValue("packages:\n  - invalid yaml syntax [");

			// Mock yaml.parse to throw an error containing "YAML" to trigger error handling
			vi.mocked(parse).mockImplementationOnce(() => {
				throw new Error("YAML parse error: invalid syntax at line 2");
			});

			const result = await getCatalog();

			expect(result).toEqual({});
		});

		it("should handle generic error when reading pnpm-workspace.yaml", async () => {
			vi.mocked(getWorkspaceRoot).mockReturnValue("/test/workspace");
			vi.mocked(stat).mockResolvedValue(createMockStats(new Date(123456789)));
			vi.mocked(readFile).mockRejectedValue(new Error("Permission denied"));

			const result = await getCatalog();

			expect(result).toEqual({});
		});

		it("should handle missing workspace root in getCatalog", async () => {
			vi.mocked(getWorkspaceRoot).mockReturnValue(undefined);

			const result = await getCatalog();

			expect(result).toEqual({});
		});

		it("should successfully read catalog from pnpm-workspace.yaml", async () => {
			vi.mocked(getWorkspaceRoot).mockReturnValue("/test/workspace");
			vi.mocked(stat).mockResolvedValue(createMockStats(new Date(123456789)));
			vi.mocked(readFile).mockResolvedValue(`
packages:
  - 'packages/*'
catalog:
  react: '^18.0.0'
  '@types/node': '^20.0.0'
  typescript: '^5.0.0'
`);

			const result = await getCatalog();

			expect(result).toEqual({
				react: "^18.0.0",
				"@types/node": "^20.0.0",
				typescript: "^5.0.0",
			});
		});

		it("should return cached catalog on subsequent calls with same mtime", async () => {
			vi.mocked(getWorkspaceRoot).mockReturnValue("/test/workspace");
			vi.mocked(stat).mockResolvedValue(createMockStats(new Date(999999999)));
			vi.mocked(readFile).mockResolvedValue(`
packages:
  - 'packages/*'
catalog:
  vue: '^3.3.0'
  lodash: '^4.17.21'
`);

			// First call
			const result1 = await getCatalog();
			expect(result1).toEqual({ vue: "^3.3.0", lodash: "^4.17.21" });

			// Clear readFile mock to ensure it's not called again
			vi.mocked(readFile).mockClear();

			// Second call - should use cache
			const result2 = await getCatalog();
			expect(result2).toEqual({ vue: "^3.3.0", lodash: "^4.17.21" });
			expect(vi.mocked(readFile)).not.toHaveBeenCalled();
		});

		it("should invalidate cache when file is modified", async () => {
			vi.mocked(getWorkspaceRoot).mockReturnValue("/test/workspace");

			// First call with initial mtime
			vi.mocked(stat).mockResolvedValue(createMockStats(new Date(777777777)));
			vi.mocked(readFile).mockResolvedValue(`
packages:
  - 'packages/*'
catalog:
  axios: '^1.5.0'
`);

			const result1 = await getCatalog();
			expect(result1).toEqual({ axios: "^1.5.0" });

			// Second call with different mtime (file modified)
			vi.mocked(stat).mockResolvedValue(createMockStats(new Date(888888888)));
			vi.mocked(readFile).mockResolvedValue(`
packages:
  - 'packages/*'
catalog:
  axios: '^1.6.0'
  express: '^4.18.0'
`);

			const result2 = await getCatalog();
			expect(result2).toEqual({
				axios: "^1.6.0",
				express: "^4.18.0",
			});
		});

		it("should handle workspace file without catalog section", async () => {
			vi.mocked(getWorkspaceRoot).mockReturnValue("/test/workspace");
			vi.mocked(stat).mockResolvedValue(createMockStats(new Date(555555555)));
			vi.mocked(readFile).mockResolvedValue(`
packages:
  - 'packages/*'
`);

			const result = await getCatalog();

			expect(result).toEqual({});
		});

		it("should handle non-Error thrown objects", async () => {
			vi.mocked(getWorkspaceRoot).mockReturnValue("/test/workspace");
			// Throw a non-Error object to trigger line 66: String(error)
			vi.mocked(stat).mockRejectedValue("string error thrown");

			const result = await getCatalog();

			expect(result).toEqual({});
		});
	});
});
