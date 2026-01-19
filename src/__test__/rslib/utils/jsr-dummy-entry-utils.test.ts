import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getJSRVirtualDummyEntry } from "#utils/jsr-dummy-entry-utils.js";

// Mock file system operations
vi.mock("node:fs", () => ({
	existsSync: vi.fn(),
	mkdirSync: vi.fn(),
	writeFileSync: vi.fn(),
}));

vi.mock("node:os", () => ({
	tmpdir: vi.fn(),
}));

vi.mock("node:path", () => ({
	join: vi.fn(),
}));

const mockExistsSync: ReturnType<typeof vi.mocked<typeof existsSync>> = vi.mocked(existsSync);
const mockMkdirSync: ReturnType<typeof vi.mocked<typeof mkdirSync>> = vi.mocked(mkdirSync);
const mockWriteFileSync: ReturnType<typeof vi.mocked<typeof writeFileSync>> = vi.mocked(writeFileSync);
const mockTmpdir: ReturnType<typeof vi.mocked<typeof tmpdir>> = vi.mocked(tmpdir);
const mockJoin: ReturnType<typeof vi.mocked<typeof join>> = vi.mocked(join);

describe("jsr-dummy-entry-utils", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockTmpdir.mockReturnValue("/tmp");
		mockJoin.mockImplementation((...args) => args.join("/"));
	});

	describe("getJSRVirtualDummyEntry", () => {
		it("should create dummy entry file in temp directory if it doesn't exist", () => {
			mockExistsSync.mockReturnValue(false);

			const result = getJSRVirtualDummyEntry();

			expect(mockTmpdir).toHaveBeenCalled();
			expect(mockMkdirSync).toHaveBeenCalledWith("/tmp/rslib-jsr-build", { recursive: true });
			expect(mockWriteFileSync).toHaveBeenCalledWith(
				"/tmp/rslib-jsr-build/dummy-entry.js",
				"// Temporary dummy entry for JSR builds\nexport default {};\n",
			);
			expect(result).toBe("/tmp/rslib-jsr-build/dummy-entry.js");
		});

		it("should return existing dummy entry path if file already exists", () => {
			mockExistsSync.mockReturnValue(true);

			const result = getJSRVirtualDummyEntry();

			expect(mockTmpdir).toHaveBeenCalled();
			expect(mockMkdirSync).toHaveBeenCalledWith("/tmp/rslib-jsr-build", { recursive: true });
			expect(mockWriteFileSync).not.toHaveBeenCalled();
			expect(result).toBe("/tmp/rslib-jsr-build/dummy-entry.js");
		});
	});
});
