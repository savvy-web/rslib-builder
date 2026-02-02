#!/usr/bin/env node
/**
 * CLI entry point for with-bin fixture.
 */

import { parseArgs, runCommand } from "./index.js";

const args: Record<string, string | boolean> = parseArgs(process.argv.slice(2));

if (args.help) {
	console.log("Usage: my-cli [options]");
	console.log("");
	console.log("Options:");
	console.log("  --help     Show this help message");
	console.log("  --version  Show version number");
	process.exit(0);
}

if (args.version) {
	console.log("1.0.0");
	process.exit(0);
}

const exitCode: number = runCommand("test", Object.keys(args));
process.exit(exitCode);
