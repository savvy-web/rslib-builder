import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { NodeLibraryBuilderOptions } from "../../../src/rslib/builders/node-library-builder.js";

/**
 * Options for generating fixture config.
 */
export interface ConfigOptions {
	/**
	 * Options to pass to NodeLibraryBuilder.create()
	 */
	builderOptions?: Partial<NodeLibraryBuilderOptions>;
}

/**
 * Options for building a fixture.
 */
export interface BuildFixtureOptions {
	/**
	 * Build target: "dev" or "npm".
	 * @defaultValue "npm"
	 */
	target?: "dev" | "npm";

	/**
	 * Configuration options for NodeLibraryBuilder.
	 * If provided, writes a fresh rslib.config.ts to the isolated fixture.
	 */
	config?: ConfigOptions;

	/**
	 * Source files to write/overwrite in the isolated fixture.
	 * Keys are relative paths (e.g., "src/index.ts"), values are file contents.
	 * Useful for testing specific source file scenarios without creating dedicated fixtures.
	 */
	sourceFiles?: Record<string, string>;

	/**
	 * Additional environment variables.
	 */
	env?: Record<string, string>;

	/**
	 * Timeout in milliseconds.
	 * @defaultValue 60000
	 */
	timeout?: number;
}

/**
 * Result of building a fixture.
 */
export interface BuildFixtureResult {
	/** Path to the dist directory */
	distPath: string;

	/** Path to the fixture directory (isolated copy) */
	fixturePath: string;

	/** Exit code of the build process */
	exitCode: number;

	/** stdout from the build */
	stdout: string;

	/** stderr from the build */
	stderr: string;

	/** Map of output filenames to their contents */
	outputs: Map<string, string>;

	/** Cleanup function to remove the isolated fixture copy */
	cleanup: () => Promise<void>;
}

/**
 * Get the fixtures directory path.
 */
export function getFixturesDir(): string {
	return join(process.cwd(), "test", "fixtures");
}

/**
 * Get the temp directory for isolated fixture copies.
 */
function getTempDir(): string {
	return join(getFixturesDir(), ".tmp");
}

/**
 * Serializes a value to a string representation for code generation.
 */
function serializeValue(value: unknown, indent: number = 0): string {
	const indentStr = "\t".repeat(indent);
	const nextIndent = "\t".repeat(indent + 1);

	if (value === undefined) return "undefined";
	if (value === null) return "null";
	if (typeof value === "string") return JSON.stringify(value);
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	if (typeof value === "function") return value.toString();
	if (value instanceof RegExp) return value.toString();

	if (Array.isArray(value)) {
		if (value.length === 0) return "[]";
		const items = value.map((item) => `${nextIndent}${serializeValue(item, indent + 1)}`);
		return `[\n${items.join(",\n")}\n${indentStr}]`;
	}

	if (typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>);
		if (entries.length === 0) return "{}";
		const props = entries.map(([key, val]) => {
			const keyStr = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
			return `${nextIndent}${keyStr}: ${serializeValue(val, indent + 1)}`;
		});
		return `{\n${props.join(",\n")}\n${indentStr}}`;
	}

	return JSON.stringify(value);
}

/**
 * Generates the content of a rslib.config.ts file with the given options.
 */
function generateConfigContent(options: ConfigOptions = {}): string {
	const { builderOptions = {} } = options;
	const serializedOptions = serializeValue(builderOptions, 0);
	return `import { NodeLibraryBuilder } from "@savvy-web/rslib-builder";

export default NodeLibraryBuilder.create(${serializedOptions});
`;
}

/**
 * Copy a fixture to an isolated temp directory.
 *
 * @remarks
 * - Copies source files (excluding dist, .rslib, node_modules)
 * - Symlinks node_modules for fast copying and correct pnpm workspace resolution
 *
 * @param fixtureName - Name of the fixture directory
 * @returns Path to the isolated copy
 */
async function copyFixtureToTemp(fixtureName: string): Promise<string> {
	const fixturesDir = getFixturesDir();
	const sourcePath = join(fixturesDir, fixtureName);
	const tempDir = getTempDir();
	const isolatedPath = join(tempDir, `${fixtureName}-${randomUUID()}`);

	// Ensure temp directory exists
	await mkdir(tempDir, { recursive: true });

	// Copy fixture to isolated directory (excluding dist, .rslib, and node_modules)
	await cp(sourcePath, isolatedPath, {
		recursive: true,
		filter: (src) => {
			const relativePath = src.replace(sourcePath, "");
			// Exclude dist, .rslib, and node_modules directories
			return (
				!relativePath.includes("/dist") && !relativePath.includes("/.rslib") && !relativePath.includes("/node_modules")
			);
		},
	});

	// Symlink node_modules from source fixture for fast resolution and correct workspace links
	const sourceNodeModules = join(sourcePath, "node_modules");
	const targetNodeModules = join(isolatedPath, "node_modules");
	try {
		await symlink(sourceNodeModules, targetNodeModules, "dir");
	} catch {
		// node_modules may not exist in the source fixture
	}

	return isolatedPath;
}

/**
 * Build a fixture package in an isolated temp directory.
 *
 * @remarks
 * Each build gets its own copy of the fixture to enable parallel test execution.
 * The isolated copy is cleaned up after the test via the cleanup function.
 *
 * @param fixtureName - Name of the fixture directory
 * @param options - Build options including config for NodeLibraryBuilder
 * @returns Build result with outputs and cleanup function
 */
export async function buildFixture(
	fixtureName: string,
	options: BuildFixtureOptions = {},
): Promise<BuildFixtureResult> {
	const { target = "npm", config, sourceFiles, env = {}, timeout = 60000 } = options;

	// Copy fixture to isolated temp directory
	const fixturePath = await copyFixtureToTemp(fixtureName);
	const distPath = join(fixturePath, "dist", target);

	// Write config to isolated fixture if provided
	if (config) {
		const configPath = join(fixturePath, "rslib.config.ts");
		const content = generateConfigContent(config);
		await writeFile(configPath, content, "utf-8");
	}

	// Write/overwrite source files if provided
	if (sourceFiles) {
		for (const [relativePath, content] of Object.entries(sourceFiles)) {
			const filePath = join(fixturePath, relativePath);
			// Ensure parent directory exists
			await mkdir(join(filePath, ".."), { recursive: true });
			await writeFile(filePath, content, "utf-8");
		}
	}

	// Run the build using spawn with piped stdio to fully capture and suppress output
	const { exitCode, stdout, stderr } = await new Promise<{ exitCode: number; stdout: string; stderr: string }>(
		(resolve) => {
			const child = spawn("pnpm", ["exec", "rslib", "build", "--env-mode", target], {
				cwd: fixturePath,
				env: { ...process.env, ...env },
				stdio: ["ignore", "pipe", "pipe"],
			});

			const stdoutChunks: Buffer[] = [];
			const stderrChunks: Buffer[] = [];

			child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
			child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

			const timeoutId = setTimeout(() => {
				child.kill("SIGTERM");
			}, timeout);

			child.on("close", (code) => {
				clearTimeout(timeoutId);
				resolve({
					exitCode: code ?? 1,
					stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
					stderr: Buffer.concat(stderrChunks).toString("utf-8"),
				});
			});
		},
	);

	// Read all output files
	const outputs = new Map<string, string>();
	try {
		const files = await readOutputFiles(distPath);
		for (const [filename, content] of files) {
			outputs.set(filename, content);
		}
	} catch {
		// dist may not exist if build failed
	}

	const cleanup = async (): Promise<void> => {
		// Remove the entire isolated fixture copy
		await rm(fixturePath, { recursive: true, force: true });
	};

	return {
		distPath,
		fixturePath,
		exitCode,
		stdout,
		stderr,
		outputs,
		cleanup,
	};
}

/**
 * Recursively read all files in a directory.
 */
async function readOutputFiles(dir: string, basePath: string = ""): Promise<Map<string, string>> {
	const files = new Map<string, string>();

	const entries = await readdir(dir, { withFileTypes: true });

	for (const entry of entries) {
		const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
		const fullPath = join(dir, entry.name);

		if (entry.isDirectory()) {
			const subFiles = await readOutputFiles(fullPath, relativePath);
			for (const [subPath, content] of subFiles) {
				files.set(subPath, content);
			}
		} else {
			// Read text files, skip binary
			if (!entry.name.endsWith(".map")) {
				try {
					const content = await readFile(fullPath, "utf-8");
					files.set(relativePath, content);
				} catch {
					// Skip files that can't be read as text
				}
			}
		}
	}

	return files;
}
