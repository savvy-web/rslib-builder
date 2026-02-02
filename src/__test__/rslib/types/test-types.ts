import type { Stats } from "node:fs";
import type { ProcessAssetsHandler } from "@rsbuild/core";
import { vi } from "vitest";

/**
 * Type for mock asset objects used in tests.
 * @internal
 */
export interface MockAsset {
	source: () => string;
}

/**
 * Type for mock asset registry used in tests.
 * @internal
 */
export type MockAssetRegistry = Record<string, MockAsset>;

/**
 * Type for mock source objects used in webpack/rspack compilation.
 * @internal
 */
export interface MockSource {
	source: () => string;
}

/**
 * Type alias for the ProcessAssetsHandler parameter.
 * @internal
 */
export type ProcessAssetsContext = Parameters<ProcessAssetsHandler>[0];

/**
 * Creates a mock Stats object for fs operations.
 *
 * @param mtime - The modification time for the mock stats
 * @param isFile - Whether the mock should report as a file (defaults to false)
 * @returns A mock Stats object compatible with Node.js fs.Stats
 *
 * @internal
 */
export function createMockStats(mtime: Date, isFile: boolean = false): Stats {
	return {
		mtime,
		isFile: (): boolean => isFile,
		isDirectory: (): boolean => false,
		isBlockDevice: (): boolean => false,
		isCharacterDevice: (): boolean => false,
		isSymbolicLink: (): boolean => false,
		isFIFO: (): boolean => false,
		isSocket: (): boolean => false,
		dev: 1,
		ino: 1,
		mode: 1,
		nlink: 1,
		uid: 1,
		gid: 1,
		rdev: 1,
		size: 1,
		blksize: 1,
		blocks: 1,
		atimeMs: mtime.getTime(),
		mtimeMs: mtime.getTime(),
		ctimeMs: mtime.getTime(),
		birthtimeMs: mtime.getTime(),
		atime: mtime,
		ctime: mtime,
		birthtime: mtime,
	};
}

/**
 * Type for mock workspace root path used in tests.
 * @internal
 */
export type MockWorkspaceRoot = string | undefined;

/**
 * Creates a mock ProcessAssetsHandler context for testing.
 *
 * @param mockOriginalSource - Optional mock for OriginalSource constructor
 * @param mockEmitAsset - Optional mock for emitAsset function
 * @returns A mock ProcessAssetsContext suitable for testing
 *
 * @internal
 */
export function createMockProcessAssetsContext(
	mockOriginalSource: ReturnType<typeof vi.fn> = vi.fn(),
	mockEmitAsset: ReturnType<typeof vi.fn> = vi.fn(),
): ProcessAssetsContext {
	return {
		assets: {},
		compiler: {} as unknown as ProcessAssetsContext["compiler"],
		compilation: { emitAsset: mockEmitAsset } as unknown as ProcessAssetsContext["compilation"],
		environment: {} as unknown as ProcessAssetsContext["environment"],
		sources: { OriginalSource: mockOriginalSource } as unknown as ProcessAssetsContext["sources"],
	};
}
