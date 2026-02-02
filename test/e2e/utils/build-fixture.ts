import { exec } from "node:child_process";
import { readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execAsync: (
	command: string,
	options?: { cwd?: string; timeout?: number; env?: NodeJS.ProcessEnv },
) => Promise<{ stdout: string; stderr: string }> = promisify(exec);

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

	/** Path to the fixture directory */
	fixturePath: string;

	/** Exit code of the build process */
	exitCode: number;

	/** stdout from the build */
	stdout: string;

	/** stderr from the build */
	stderr: string;

	/** Map of output filenames to their contents */
	outputs: Map<string, string>;

	/** Cleanup function to remove dist directory */
	cleanup: () => Promise<void>;
}

/**
 * Get the fixtures directory path.
 */
export function getFixturesDir(): string {
	return join(process.cwd(), "test", "fixtures");
}

/**
 * Build a fixture package in place and return the results.
 *
 * @remarks
 * Builds are run in place using the workspace link to rslib-builder.
 * The dist directory is cleaned up after each test.
 *
 * @param fixtureName - Name of the fixture directory
 * @param options - Build options
 * @returns Build result with outputs and cleanup function
 */
export async function buildFixture(
	fixtureName: string,
	options: BuildFixtureOptions = {},
): Promise<BuildFixtureResult> {
	const { target = "npm", env = {}, timeout = 60000 } = options;

	const fixturesDir = getFixturesDir();
	const fixturePath = join(fixturesDir, fixtureName);
	const distPath = join(fixturePath, "dist", target);

	// Clean any previous build output
	await rm(join(fixturePath, "dist"), { recursive: true, force: true });
	await rm(join(fixturePath, ".rslib"), { recursive: true, force: true });

	let exitCode = 0;
	let stdout = "";
	let stderr = "";

	try {
		// Run the build using pnpm exec (uses workspace-linked rslib-builder)
		const buildResult = await execAsync(`pnpm exec rslib build --env-mode ${target}`, {
			cwd: fixturePath,
			timeout,
			env: { ...process.env, ...env, NODE_OPTIONS: "--disable-warning=ExperimentalWarning" },
		});

		stdout = buildResult.stdout;
		stderr = buildResult.stderr;
	} catch (error) {
		const execError = error as { code?: number; stdout?: string; stderr?: string };
		exitCode = execError.code ?? 1;
		stdout = execError.stdout ?? "";
		stderr = execError.stderr ?? "";
	}

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
		await rm(join(fixturePath, "dist"), { recursive: true, force: true });
		await rm(join(fixturePath, ".rslib"), { recursive: true, force: true });
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
