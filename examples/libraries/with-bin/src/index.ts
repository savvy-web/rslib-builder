/**
 * Library functions for with-bin fixture.
 *
 * @packageDocumentation
 */

/**
 * Runs a command with the given arguments.
 *
 * @param command - The command to run
 * @param args - Command arguments
 * @returns Exit code
 *
 * @public
 */
export function runCommand(command: string, args: string[]): number {
	console.log(`Running: ${command} ${args.join(" ")}`);
	return 0;
}

/**
 * Parses command line arguments.
 *
 * @param argv - Raw argument array
 * @returns Parsed arguments object
 *
 * @public
 */
export function parseArgs(argv: string[]): Record<string, string | boolean> {
	const result: Record<string, string | boolean> = {};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg?.startsWith("--")) {
			const key = arg.slice(2);
			const nextArg = argv[i + 1];
			if (nextArg && !nextArg.startsWith("-")) {
				result[key] = nextArg;
				i++;
			} else {
				result[key] = true;
			}
		}
	}

	return result;
}
