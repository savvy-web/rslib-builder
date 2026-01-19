import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockProcessAssetsContext, createMockStats } from "../../../__test__/rslib/utils/test-types.js";

// Mock node:fs/promises
vi.mock("node:fs/promises");

import { readFile, stat } from "node:fs/promises";

const mockReadFile: ReturnType<typeof vi.mocked<typeof readFile>> = vi.mocked(readFile);
const mockStat: ReturnType<typeof vi.mocked<typeof stat>> = vi.mocked(stat);

// Import the function we want to test - this will use the actual implementation
// but with mocked fs functions
import { createAssetProcessor } from "#utils/asset-utils.js";

describe("asset-processor-utils", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Mock process.cwd to return a consistent path
		vi.spyOn(process, "cwd").mockReturnValue("/test");
	});

	describe("createAssetProcessor", () => {
		it("should create a processor function", () => {
			const cache = new Map();
			const processor = createAssetProcessor("test.txt", cache);
			expect(typeof processor).toBe("function");
		});

		it("should emit asset when file exists", async () => {
			const cache = new Map();
			const processor = createAssetProcessor("package.json", cache);

			const fileContent = '{"name": "test"}';

			// Mock stat to return valid stats (file exists)
			mockStat.mockResolvedValue(createMockStats(new Date(1000)));
			mockReadFile.mockResolvedValue(fileContent);

			const mockOriginalSource = vi.fn();
			const mockEmitAsset = vi.fn();

			await processor(createMockProcessAssetsContext(mockOriginalSource, mockEmitAsset));

			expect(mockStat).toHaveBeenCalledWith("/test/package.json");
			expect(mockReadFile).toHaveBeenCalledWith("/test/package.json", "utf-8");
			expect(mockOriginalSource).toHaveBeenCalledWith(fileContent, "package.json");
			expect(mockEmitAsset).toHaveBeenCalledWith("package.json", expect.anything());
		});

		it("should not emit asset when file doesn't exist", async () => {
			const cache = new Map();
			const processor = createAssetProcessor("missing.txt", cache);

			// Mock stat to reject (file doesn't exist)
			mockStat.mockRejectedValue(new Error("ENOENT"));

			const mockEmitAsset = vi.fn();
			const mockOriginalSource = vi.fn();

			await processor(createMockProcessAssetsContext(mockOriginalSource, mockEmitAsset));

			expect(mockStat).toHaveBeenCalledWith("/test/missing.txt");
			expect(mockReadFile).not.toHaveBeenCalled();
			expect(mockEmitAsset).not.toHaveBeenCalled();
		});

		it("should cache file content and reuse it when file hasn't changed", async () => {
			const cache = new Map();
			const processor = createAssetProcessor("README.md", cache);

			const fileContent = "# Test Package";

			mockStat.mockResolvedValue(createMockStats(new Date(2000)));
			mockReadFile.mockResolvedValue(fileContent);

			const mockOriginalSource = vi.fn();
			const mockEmitAsset = vi.fn();

			// First call - should read from file
			await processor(createMockProcessAssetsContext(mockOriginalSource, mockEmitAsset));

			expect(mockReadFile).toHaveBeenCalledTimes(1);
			expect(cache.size).toBe(1);
			expect(cache.get("README.md-/test/README.md")).toEqual({
				content: fileContent,
				mtime: 2000,
			});

			// Reset mocks for second call
			mockReadFile.mockClear();
			mockOriginalSource.mockClear();
			mockEmitAsset.mockClear();

			// Second call with same mtime - should use cache
			await processor(createMockProcessAssetsContext(mockOriginalSource, mockEmitAsset));

			expect(mockStat).toHaveBeenCalledTimes(4); // 2 for first call (fileExistAsync + mtime), 2 for second call
			expect(mockReadFile).not.toHaveBeenCalled(); // Should not read file again
			expect(mockOriginalSource).toHaveBeenCalledWith(fileContent, "README.md");
			expect(mockEmitAsset).toHaveBeenCalledWith("README.md", expect.anything());
		});

		it("should invalidate cache and re-read file when mtime changes", async () => {
			const cache = new Map();
			const processor = createAssetProcessor("LICENSE", cache);

			const originalContent = "MIT License";
			const updatedContent = "MIT License Updated";

			const mockOriginalSource = vi.fn();
			const mockEmitAsset = vi.fn();

			// First call
			mockStat.mockResolvedValue(createMockStats(new Date(3000)));
			mockReadFile.mockResolvedValue(originalContent);

			await processor(createMockProcessAssetsContext(mockOriginalSource, mockEmitAsset));

			expect(cache.get("LICENSE-/test/LICENSE")).toEqual({
				content: originalContent,
				mtime: 3000,
			});

			// Reset mocks
			mockReadFile.mockClear();
			mockOriginalSource.mockClear();
			mockEmitAsset.mockClear();

			// Second call with different mtime
			mockStat.mockResolvedValue(createMockStats(new Date(4000)));
			mockReadFile.mockResolvedValue(updatedContent);

			await processor(createMockProcessAssetsContext(mockOriginalSource, mockEmitAsset));

			expect(mockReadFile).toHaveBeenCalledTimes(1); // Should read file again
			expect(cache.get("LICENSE-/test/LICENSE")).toEqual({
				content: updatedContent,
				mtime: 4000,
			});
			expect(mockOriginalSource).toHaveBeenCalledWith(updatedContent, "LICENSE");
		});

		it("should handle different cache keys for different files", async () => {
			const cache = new Map();
			const processor1 = createAssetProcessor("file1.txt", cache);
			const processor2 = createAssetProcessor("file2.txt", cache);

			mockStat
				.mockResolvedValueOnce(createMockStats(new Date(5000)))
				.mockResolvedValueOnce(createMockStats(new Date(5000))); // First processor: fileExistAsync + mtime
			mockStat
				.mockResolvedValueOnce(createMockStats(new Date(6000)))
				.mockResolvedValueOnce(createMockStats(new Date(6000))); // Second processor

			mockReadFile.mockResolvedValueOnce("Content 1").mockResolvedValueOnce("Content 2");

			const mockOriginalSource = vi.fn();
			const mockEmitAsset = vi.fn();
			const mockContext = createMockProcessAssetsContext(mockOriginalSource, mockEmitAsset);

			await processor1(mockContext);
			await processor2(mockContext);

			expect(cache.size).toBe(2);
			expect(cache.get("file1.txt-/test/file1.txt")).toEqual({
				content: "Content 1",
				mtime: 5000,
			});
			expect(cache.get("file2.txt-/test/file2.txt")).toEqual({
				content: "Content 2",
				mtime: 6000,
			});
		});

		it("should handle different asset paths for same filename", async () => {
			// This test verifies cache keys include the full path
			// When the cwd changes, the cache key changes too
			const cache = new Map();
			const processor = createAssetProcessor("config.json", cache);

			vi.spyOn(process, "cwd").mockReturnValue("/project1");
			mockStat.mockResolvedValue(createMockStats(new Date(7000)));
			mockReadFile.mockResolvedValue('{"env": "dev"}');

			const mockOriginalSource = vi.fn();
			const mockEmitAsset = vi.fn();

			await processor(createMockProcessAssetsContext(mockOriginalSource, mockEmitAsset));

			expect(cache.size).toBe(1);
			expect(cache.get("config.json-/project1/config.json")).toEqual({
				content: '{"env": "dev"}',
				mtime: 7000,
			});

			// Change cwd and run again
			vi.spyOn(process, "cwd").mockReturnValue("/project2");
			mockStat.mockResolvedValue(createMockStats(new Date(8000)));
			mockReadFile.mockResolvedValue('{"env": "prod"}');

			await processor(createMockProcessAssetsContext(mockOriginalSource, mockEmitAsset));

			expect(cache.size).toBe(2);
			expect(cache.get("config.json-/project2/config.json")).toEqual({
				content: '{"env": "prod"}',
				mtime: 8000,
			});
		});
	});
});
