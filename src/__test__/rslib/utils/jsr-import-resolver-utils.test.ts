import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveImportPath } from "#utils/jsr-import-resolver-utils.js";

// Mock file system operations
vi.mock("node:fs/promises", () => ({
	access: vi.fn(),
	stat: vi.fn().mockRejectedValue(new Error("ENOENT")),
}));

vi.mock("node:path", () => ({
	resolve: vi.fn(),
}));

// Static imports after mocks are set up
import * as fs from "node:fs/promises";
import * as path from "node:path";

const mockAccess: ReturnType<typeof vi.mocked<typeof fs.access>> = vi.mocked(fs.access);
const mockResolve: ReturnType<typeof vi.mocked<typeof path.resolve>> = vi.mocked(path.resolve);

describe("jsr-import-resolver-utils", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockResolve.mockImplementation((...args) => args.join("/"));
	});

	describe("resolveImportPath", () => {
		it("should resolve TypeScript file with .ts extension", async () => {
			mockAccess.mockResolvedValue(undefined);

			const result = await resolveImportPath("/project/src", "./utils.js");

			expect(mockResolve).toHaveBeenCalledWith("/project/src", "./utils");
			expect(result).toBe("/project/src/./utils.ts");
		});

		it("should resolve TypeScript file that already has .ts extension", async () => {
			mockAccess.mockResolvedValue(undefined);

			const result = await resolveImportPath("/project/src", "./utils.ts");

			expect(result).toBe("/project/src/./utils.ts");
		});

		it("should resolve index.ts file", async () => {
			mockAccess.mockRejectedValueOnce(new Error()); // ./utils.ts doesn't exist
			mockAccess.mockRejectedValueOnce(new Error()); // ./utils.tsx doesn't exist
			mockAccess.mockResolvedValueOnce(undefined); // ./utils/index.ts exists

			const result = await resolveImportPath("/project/src", "./utils");

			expect(result).toBe("/project/src/./utils/index.ts");
		});

		it("should resolve index.tsx file", async () => {
			mockAccess.mockRejectedValueOnce(new Error()); // ./utils.ts doesn't exist
			mockAccess.mockRejectedValueOnce(new Error()); // ./utils.tsx doesn't exist
			mockAccess.mockRejectedValueOnce(new Error()); // ./utils/index.ts doesn't exist
			mockAccess.mockResolvedValueOnce(undefined); // ./utils/index.tsx exists

			const result = await resolveImportPath("/project/src", "./utils");

			expect(result).toBe("/project/src/./utils/index.tsx");
		});

		it("should return null if no matching file is found", async () => {
			mockAccess.mockRejectedValue(new Error());

			const result = await resolveImportPath("/project/src", "./nonexistent");

			expect(result).toBeNull();
		});

		it("should handle .tsx files", async () => {
			mockAccess.mockRejectedValueOnce(new Error()); // .ts doesn't exist
			mockAccess.mockResolvedValueOnce(undefined); // .tsx exists

			const result = await resolveImportPath("/project/src", "./component");

			expect(result).toBe("/project/src/./component.tsx");
		});
	});
});
