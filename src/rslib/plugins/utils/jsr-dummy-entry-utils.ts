import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Gets a virtual dummy entry configuration for JSR builds.
 * This creates a temporary file in the system temp directory instead of the source directory.
 *
 * @returns A path to a temporary dummy entry file that RSLib can use
 */
export function getJSRVirtualDummyEntry(): string {
	// Create a temporary file in the system temp directory
	// This avoids polluting the source directory
	const tempDir = join(tmpdir(), "rslib-jsr-build");
	const dummyPath = join(tempDir, "dummy-entry.js");

	// Ensure directory exists
	mkdirSync(tempDir, { recursive: true });

	// Write minimal dummy entry file if it doesn't exist
	if (!existsSync(dummyPath)) {
		writeFileSync(dummyPath, "// Temporary dummy entry for JSR builds\nexport default {};\n");
	}

	return dummyPath;
}
