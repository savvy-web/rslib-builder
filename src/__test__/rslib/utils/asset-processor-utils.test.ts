import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockProcessAssetsContext, createMockStats } from "./test-types.js";

// Mock node:fs/promises and file-utils
vi.mock("node:fs/promises");
vi.mock("#utils/file-utils.js");

import { readFile, stat } from "node:fs/promises";
// Static imports after mocks are set up
import { createAssetProcessor } from "#utils/asset-processor-utils.js";
import { fileExistAsync } from "#utils/file-utils.js";

const mockReadFile: ReturnType<typeof vi.mocked<typeof readFile>> = vi.mocked(readFile);
const mockStat: ReturnType<typeof vi.mocked<typeof stat>> = vi.mocked(stat);
const mockFileExistAsync: ReturnType<typeof vi.mocked<typeof fileExistAsync>> = vi.mocked(fileExistAsync);

describe("asset-processor-utils", () => {
	beforeEach(() => {
		vi.clearAllMocks();
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

			mockFileExistAsync.mockResolvedValue({
				assetName: "package.json",
				assetPath: "/test/package.json",
				assetExists: true,
			});
			mockStat.mockResolvedValue(createMockStats(new Date(1000)));
			mockReadFile.mockResolvedValue(fileContent);

			const mockOriginalSource = vi.fn();
			const mockEmitAsset = vi.fn();

			await processor(createMockProcessAssetsContext(mockOriginalSource, mockEmitAsset));

			expect(mockFileExistAsync).toHaveBeenCalledWith("package.json");
			expect(mockStat).toHaveBeenCalledWith("/test/package.json");
			expect(mockReadFile).toHaveBeenCalledWith("/test/package.json", "utf-8");
			expect(mockOriginalSource).toHaveBeenCalledWith(fileContent, "package.json");
			expect(mockEmitAsset).toHaveBeenCalledWith("package.json", expect.anything());
		});

		it("should not emit asset when file doesn't exist", async () => {
			const cache = new Map();
			const processor = createAssetProcessor("missing.txt", cache);

			mockFileExistAsync.mockResolvedValue({
				assetName: "missing.txt",
				assetPath: "/test/missing.txt",
				assetExists: false,
			});

			const mockEmitAsset = vi.fn();
			const mockOriginalSource = vi.fn();

			await processor(createMockProcessAssetsContext(mockOriginalSource, mockEmitAsset));

			expect(mockFileExistAsync).toHaveBeenCalledWith("missing.txt");
			expect(mockStat).not.toHaveBeenCalled();
			expect(mockReadFile).not.toHaveBeenCalled();
			expect(mockEmitAsset).not.toHaveBeenCalled();
		});

		it("should cache file content and reuse it when file hasn't changed", async () => {
			const cache = new Map();
			const processor = createAssetProcessor("README.md", cache);

			const fileContent = "# Test Package";

			mockFileExistAsync.mockResolvedValue({
				assetName: "README.md",
				assetPath: "/test/README.md",
				assetExists: true,
			});
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

			expect(mockStat).toHaveBeenCalledTimes(2); // Still needs to check mtime
			expect(mockReadFile).not.toHaveBeenCalled(); // Should not read file again
			expect(mockOriginalSource).toHaveBeenCalledWith(fileContent, "README.md");
			expect(mockEmitAsset).toHaveBeenCalledWith("README.md", expect.anything());
		});

		it("should invalidate cache and re-read file when mtime changes", async () => {
			const cache = new Map();
			const processor = createAssetProcessor("LICENSE", cache);

			const originalContent = "MIT License";
			const updatedContent = "MIT License Updated";

			mockFileExistAsync.mockResolvedValue({
				assetName: "LICENSE",
				assetPath: "/test/LICENSE",
				assetExists: true,
			});

			const mockOriginalSource = vi.fn();
			const mockEmitAsset = vi.fn();

			// First call
			mockStat.mockResolvedValueOnce(createMockStats(new Date(3000)));
			mockReadFile.mockResolvedValueOnce(originalContent);

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
			mockStat.mockResolvedValueOnce(createMockStats(new Date(4000)));
			mockReadFile.mockResolvedValueOnce(updatedContent);

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

			mockFileExistAsync
				.mockResolvedValueOnce({
					assetName: "file1.txt",
					assetPath: "/test/file1.txt",
					assetExists: true,
				})
				.mockResolvedValueOnce({
					assetName: "file2.txt",
					assetPath: "/test/file2.txt",
					assetExists: true,
				});

			mockStat
				.mockResolvedValueOnce(createMockStats(new Date(5000)))
				.mockResolvedValueOnce(createMockStats(new Date(6000)));

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
			const cache = new Map();
			const processor = createAssetProcessor("config.json", cache);

			mockFileExistAsync
				.mockResolvedValueOnce({
					assetName: "config.json",
					assetPath: "/project1/config.json",
					assetExists: true,
				})
				.mockResolvedValueOnce({
					assetName: "config.json",
					assetPath: "/project2/config.json",
					assetExists: true,
				});

			mockStat
				.mockResolvedValueOnce(createMockStats(new Date(7000)))
				.mockResolvedValueOnce(createMockStats(new Date(8000)));

			mockReadFile.mockResolvedValueOnce('{"env": "dev"}').mockResolvedValueOnce('{"env": "prod"}');

			const mockOriginalSource = vi.fn();
			const mockEmitAsset = vi.fn();

			await processor(createMockProcessAssetsContext(mockOriginalSource, mockEmitAsset));
			await processor(createMockProcessAssetsContext(mockOriginalSource, mockEmitAsset));

			expect(cache.size).toBe(2);
			expect(cache.get("config.json-/project1/config.json")).toEqual({
				content: '{"env": "dev"}',
				mtime: 7000,
			});
			expect(cache.get("config.json-/project2/config.json")).toEqual({
				content: '{"env": "prod"}',
				mtime: 8000,
			});
		});
	});
});
