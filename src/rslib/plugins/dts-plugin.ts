import { spawn } from "node:child_process";
import type { PathLike } from "node:fs";
import { constants, existsSync } from "node:fs";
import { access, copyFile, mkdir, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import { StandardTags, Standardization, TSDocTagSyntaxKind } from "@microsoft/tsdoc";
import type { RsbuildPlugin, RsbuildPluginAPI } from "@rsbuild/core";
import { logger } from "@rsbuild/core";
import deepEqual from "deep-equal";
import color from "picocolors";
import type { Diagnostic, ParsedCommandLine } from "typescript";
import {
	createCompilerHost,
	findConfigFile,
	formatDiagnostic,
	parseJsonConfigFileContent,
	readConfigFile,
	sys,
} from "typescript";
import { getWorkspaceManagerRoot } from "workspace-tools";
import { TSConfigs } from "../../tsconfig/index.js";
import type { PackageJson } from "../../types/package-json.js";
import { createEnvLogger } from "./utils/build-logger.js";
import { EntryExtractor } from "./utils/entry-extractor.js";
import { getApiExtractorPath } from "./utils/file-utils.js";
import { createMessageSuppressor } from "./utils/message-suppressor.js";
import { TsconfigResolver } from "./utils/tsconfig-resolver.js";

/**
 * TSDoc tag definition for custom documentation tags.
 * @public
 */
export interface TsDocTagDefinition {
	/** The tag name including the at-sign prefix (e.g., `\@error`, `\@category`) */
	tagName: string;
	/** How the tag is parsed: "block" | "inline" | "modifier" */
	syntaxKind: "block" | "inline" | "modifier";
	/** Whether the tag can appear multiple times on a declaration */
	allowMultiple?: boolean;
}

/**
 * TSDoc standardization groups for predefined tag sets.
 *
 * @remarks
 * These groups correspond to the TSDoc specification's standardization levels
 * as defined in `\@microsoft/tsdoc`. Each group contains a set of related tags:
 *
 * - `"core"`: Essential tags for basic documentation
 *   (`\@param`, `\@returns`, `\@remarks`, `\@deprecated`, `\@privateRemarks`, etc.)
 *
 * - `"extended"`: Additional tags for richer documentation
 *   (`\@example`, `\@defaultValue`, `\@see`, `\@throws`, `\@typeParam`, etc.)
 *
 * - `"discretionary"`: Release stage and visibility modifiers
 *   (`\@alpha`, `\@beta`, `\@public`, `\@internal`, `\@experimental`)
 *
 * @example
 * ```typescript
 * import type { TsDocTagGroup } from '@savvy-web/rslib-builder';
 *
 * const groups: TsDocTagGroup[] = ['core', 'extended'];
 * ```
 *
 * @public
 */
export type TsDocTagGroup = "core" | "extended" | "discretionary";

/**
 * TSDoc configuration options for API Extractor.
 * @remarks
 * Provides ergonomic defaults - standard tags are auto-enabled via `groups`,
 * custom tags are auto-supported, and `supportForTags` is only needed to
 * disable specific tags.
 *
 * **Config optimization:** When all groups are enabled (default), the generated
 * `tsdoc.json` uses `noStandardTags: false` to let TSDoc automatically load
 * all standard tags, producing a minimal config file. When a subset of groups
 * is specified, `noStandardTags: true` is used and only the enabled groups'
 * tags are explicitly defined.
 *
 * @public
 */
export interface TsDocOptions {
	/**
	 * TSDoc tag groups to enable. Each group includes predefined standard tags
	 * from the official `\@microsoft/tsdoc` package.
	 * - "core": Essential TSDoc tags (\@param, \@returns, \@remarks, \@deprecated, etc.)
	 * - "extended": Additional tags (\@example, \@defaultValue, \@see, \@throws, etc.)
	 * - "discretionary": Release stage tags (\@alpha, \@beta, \@public, \@internal)
	 *
	 * @remarks
	 * When all groups are enabled (the default), the generated config uses
	 * `noStandardTags: false` and TSDoc loads standard tags automatically.
	 * When a subset is specified, `noStandardTags: true` is used and only
	 * the tags from enabled groups are defined.
	 *
	 * @defaultValue ["core", "extended", "discretionary"]
	 */
	groups?: TsDocTagGroup[];

	/**
	 * Custom TSDoc tag definitions beyond the standard groups.
	 * These are automatically added to supportForTags (no need to declare twice).
	 *
	 * @example
	 * ```typescript
	 * import type { TsDocTagDefinition } from '@savvy-web/rslib-builder';
	 *
	 * const tagDefinitions: TsDocTagDefinition[] = [
	 *   { tagName: '@error', syntaxKind: 'inline' },
	 *   { tagName: '@category', syntaxKind: 'block', allowMultiple: false },
	 * ];
	 * ```
	 */
	tagDefinitions?: TsDocTagDefinition[];

	/**
	 * Override support for specific tags. Only needed to DISABLE tags.
	 * Tags from enabled groups and custom tagDefinitions are auto-supported.
	 *
	 * @example
	 * Disable \@beta even though "extended" group is enabled:
	 * ```typescript
	 * const supportForTags: Record<string, boolean> = { '@beta': false };
	 * ```
	 */
	supportForTags?: Record<string, boolean>;

	/**
	 * How to handle TSDoc validation warnings from API Extractor.
	 * - `"log"`: Show warnings in the console but continue the build
	 * - `"fail"`: Show warnings and fail the build if any are found
	 * - `"none"`: Suppress TSDoc warnings entirely
	 *
	 * @remarks
	 * TSDoc warnings include unknown tags, malformed syntax, and other
	 * documentation issues detected by API Extractor during processing.
	 *
	 * **Important:** This setting only applies to first-party warnings (from your
	 * project's source code). Third-party warnings from dependencies in
	 * `node_modules/` are always logged but never fail the build, since they
	 * cannot be fixed by the consuming project.
	 *
	 * @defaultValue `"fail"` in CI environments (`CI` or `GITHUB_ACTIONS` env vars),
	 *               `"log"` otherwise
	 */
	warnings?: "log" | "fail" | "none";

	/**
	 * TSDoc lint validation options.
	 * Validates TSDoc comments before the build starts using ESLint.
	 *
	 * @remarks
	 * Lint validation is **enabled by default**. Set to `false` to disable.
	 * When enabled, it uses the parent TSDoc configuration (tagDefinitions, groups, etc.)
	 * for validation rules.
	 *
	 * @defaultValue true
	 *
	 * @example
	 * Disable lint validation:
	 * ```typescript
	 * apiModel: {
	 *   tsdoc: {
	 *     lint: false,
	 *   },
	 * }
	 * ```
	 *
	 * @example
	 * Customize lint behavior:
	 * ```typescript
	 * apiModel: {
	 *   tsdoc: {
	 *     tagDefinitions: [{ tagName: '@error', syntaxKind: 'inline' }],
	 *     lint: {
	 *       onError: 'throw',
	 *       include: ['src/**\/*.ts'],
	 *     },
	 *   },
	 * }
	 * ```
	 */
	lint?: TsDocLintOptions | boolean;
}

/**
 * Error behavior for TSDoc lint errors.
 *
 * @remarks
 * - `"warn"`: Log warnings but continue the build
 * - `"error"`: Log errors but continue the build
 * - `"throw"`: Fail the build with an error
 *
 * @public
 */
export type TsDocLintErrorBehavior = "warn" | "error" | "throw";

/**
 * Options for TSDoc lint validation (subset of TsDocLintPluginOptions).
 * TSDoc configuration is inherited from the parent TsDocOptions.
 *
 * @public
 */
export interface TsDocLintOptions {
	/**
	 * Override automatic file discovery with explicit file paths or glob patterns.
	 *
	 * @remarks
	 * By default, uses import graph analysis to discover files from your package's exports.
	 * This ensures only public API files are linted.
	 *
	 * @example
	 * ```typescript
	 * lint: {
	 *   include: ["src/**\/*.ts", "!**\/*.test.ts"],
	 * }
	 * ```
	 */
	include?: string[];

	/**
	 * How to handle TSDoc lint errors.
	 * - `"warn"`: Log warnings but continue the build
	 * - `"error"`: Log errors but continue the build
	 * - `"throw"`: Fail the build with an error
	 *
	 * @defaultValue `"throw"` in CI environments, `"error"` locally
	 */
	onError?: TsDocLintErrorBehavior;

	/**
	 * Persist tsdoc.json to disk for tool integration (ESLint, IDEs).
	 * - `true`: Write to project root as "tsdoc.json" (or validate in CI)
	 * - `PathLike`: Write to specified path (or validate in CI)
	 * - `false`: Clean up after linting (not recommended)
	 *
	 * @remarks
	 * In CI environments (`CI` or `GITHUB_ACTIONS` env vars set to "true"),
	 * the config file is validated instead of written. If the existing file
	 * doesn't match the expected configuration, the build fails with an error
	 * instructing the developer to regenerate the file locally.
	 *
	 * @defaultValue `true`
	 */
	persistConfig?: boolean | PathLike;
}

/**
 * Options for tsdoc-metadata.json generation.
 * @public
 */
export interface TsDocMetadataOptions {
	/**
	 * Whether to generate tsdoc-metadata.json.
	 * @defaultValue true (when apiModel is enabled)
	 */
	enabled?: boolean;

	/**
	 * Custom filename for the TSDoc metadata file.
	 * @defaultValue "tsdoc-metadata.json"
	 */
	filename?: string;
}

/**
 * Builder for TSDoc configuration files used by API Extractor.
 *
 * @remarks
 * This class provides utilities for generating `tsdoc.json` configuration files
 * that control TSDoc tag support during API documentation generation.
 *
 * ## Features
 *
 * - Expands tag groups into individual tag definitions
 * - Generates properly formatted tsdoc.json files
 * - Handles config persistence based on environment (CI vs local)
 * - Supports custom tag definitions
 *
 * ## Tag Groups
 *
 * The builder supports three standardization groups from `\@microsoft/tsdoc`:
 * - `core`: Essential tags (`\@param`, `\@returns`, `\@remarks`, etc.)
 * - `extended`: Additional tags (`\@example`, `\@defaultValue`, `\@see`, etc.)
 * - `discretionary`: Release tags (`\@alpha`, `\@beta`, `\@public`, `\@internal`)
 *
 * @example
 * Build tag configuration from options:
 * ```typescript
 * import { TsDocConfigBuilder } from '@savvy-web/rslib-builder';
 *
 * const config = TsDocConfigBuilder.build({
 *   groups: ['core', 'extended'],
 *   tagDefinitions: [
 *     { tagName: '@error', syntaxKind: 'inline' },
 *   ],
 * });
 * ```
 *
 * @example
 * Write a tsdoc.json file:
 * ```typescript
 * import { TsDocConfigBuilder } from '@savvy-web/rslib-builder';
 *
 * const configPath = await TsDocConfigBuilder.writeConfigFile(
 *   { groups: ['core', 'extended', 'discretionary'] },
 *   process.cwd(),
 * );
 * ```
 *
 * @public
 */
// biome-ignore lint/complexity/noStaticOnlyClass: Intentional class-based API for co-located business logic
export class TsDocConfigBuilder {
	/** All available TSDoc tag groups. */
	static readonly ALL_GROUPS: TsDocTagGroup[] = ["core", "extended", "discretionary"];

	/** Maps group names to TSDoc Standardization enum values. */
	private static readonly GROUP_TO_STANDARDIZATION: Record<TsDocTagGroup, Standardization> = {
		core: Standardization.Core,
		extended: Standardization.Extended,
		discretionary: Standardization.Discretionary,
	};

	/**
	 * Standard TSDoc tag definitions organized by standardization group.
	 * Lazily computed from `\@microsoft/tsdoc` StandardTags.
	 */
	static readonly TAG_GROUPS: Record<TsDocTagGroup, TsDocTagDefinition[]> = {
		get core(): TsDocTagDefinition[] {
			return TsDocConfigBuilder.getTagsForGroup("core");
		},
		get extended(): TsDocTagDefinition[] {
			return TsDocConfigBuilder.getTagsForGroup("extended");
		},
		get discretionary(): TsDocTagDefinition[] {
			return TsDocConfigBuilder.getTagsForGroup("discretionary");
		},
	};

	/**
	 * Detects if running in a CI environment.
	 * @returns true if CI or GITHUB_ACTIONS environment variable is "true"
	 */
	static isCI(): boolean {
		return process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
	}

	/**
	 * Gets standard TSDoc tag definitions for a specific group.
	 * Uses StandardTags from `\@microsoft/tsdoc` package.
	 */
	static getTagsForGroup(group: TsDocTagGroup): TsDocTagDefinition[] {
		const standardization = TsDocConfigBuilder.GROUP_TO_STANDARDIZATION[group];
		return StandardTags.allDefinitions
			.filter((tag) => tag.standardization === standardization)
			.map((tag) => ({
				tagName: tag.tagName,
				syntaxKind: TsDocConfigBuilder.syntaxKindToString(tag.syntaxKind),
				...(tag.allowMultiple ? { allowMultiple: true } : {}),
			}));
	}

	/**
	 * Determines if the TSDoc config should be persisted to disk.
	 * @param persistConfig - The persistConfig option value
	 * @returns true if the config should be persisted
	 */
	static shouldPersist(persistConfig: boolean | PathLike | undefined): boolean {
		return persistConfig !== false;
	}

	/**
	 * Gets the output path for the tsdoc.json file.
	 * @param persistConfig - The persistConfig option value
	 * @param cwd - The current working directory
	 * @returns The absolute path where tsdoc.json should be written
	 */
	static getConfigPath(persistConfig: boolean | PathLike | undefined, cwd: string): string {
		if (typeof persistConfig === "string") {
			return isAbsolute(persistConfig) ? persistConfig : join(cwd, persistConfig);
		}
		if (persistConfig instanceof URL || Buffer.isBuffer(persistConfig)) {
			const pathStr = persistConfig.toString();
			return isAbsolute(pathStr) ? pathStr : join(cwd, pathStr);
		}
		// Default: project root
		return join(cwd, "tsdoc.json");
	}

	/**
	 * Builds the complete TSDoc configuration from options.
	 *
	 * @remarks
	 * When all groups are enabled (default), returns `useStandardTags: true` to signal
	 * that the generated config should use `noStandardTags: false` and let TSDoc
	 * automatically load all standard tags. However, `supportForTags` is still populated
	 * because API Extractor requires explicit support declarations for each tag.
	 *
	 * When a subset of groups is specified, returns `useStandardTags: false` to signal
	 * that we must explicitly define which tags to include via `noStandardTags: true`.
	 */
	static build(options: TsDocOptions = {}): {
		tagDefinitions: TsDocTagDefinition[];
		supportForTags: Record<string, boolean>;
		useStandardTags: boolean;
	} {
		// Default to all groups if not specified
		const groups = options.groups ?? TsDocConfigBuilder.ALL_GROUPS;

		// Check if all groups are enabled (allows TSDoc to load standard tags automatically)
		const allGroupsEnabled = TsDocConfigBuilder.ALL_GROUPS.every((g) => groups.includes(g));

		// Collect tag definitions from enabled groups
		// When all groups enabled: only custom tags in tagDefinitions, but all standard tags in supportForTags
		// When subset: both tagDefinitions and supportForTags contain only enabled group tags
		const tagDefinitions: TsDocTagDefinition[] = [];
		const supportForTags: Record<string, boolean> = {};

		// Always populate supportForTags from enabled groups (API Extractor requires this)
		for (const group of groups) {
			for (const tag of TsDocConfigBuilder.TAG_GROUPS[group]) {
				supportForTags[tag.tagName] = true;
				// Only add to tagDefinitions when subset of groups (noStandardTags: true)
				if (!allGroupsEnabled) {
					tagDefinitions.push(tag);
				}
			}
		}

		// Add custom tag definitions (always needed in both tagDefinitions and supportForTags)
		if (options.tagDefinitions) {
			for (const tag of options.tagDefinitions) {
				tagDefinitions.push(tag);
				supportForTags[tag.tagName] = true;
			}
		}

		// Apply user overrides (to disable specific tags)
		if (options.supportForTags) {
			Object.assign(supportForTags, options.supportForTags);
		}

		return { tagDefinitions, supportForTags, useStandardTags: allGroupsEnabled };
	}

	/**
	 * Builds the tsdoc.json configuration object from options.
	 * @internal
	 */
	static buildConfigObject(options: TsDocOptions = {}): Record<string, unknown> {
		const { tagDefinitions, supportForTags, useStandardTags } = TsDocConfigBuilder.build(options);

		const tsdocConfig: Record<string, unknown> = {
			$schema: "https://developer.microsoft.com/json-schemas/tsdoc/v0/tsdoc.schema.json",
			noStandardTags: !useStandardTags,
			reportUnsupportedHtmlElements: true,
		};

		// Only include tagDefinitions if there are any (custom tags or subset of groups)
		if (tagDefinitions.length > 0) {
			tsdocConfig.tagDefinitions = tagDefinitions;
		}

		// Only include supportForTags if there are any entries
		if (Object.keys(supportForTags).length > 0) {
			tsdocConfig.supportForTags = supportForTags;
		}

		return tsdocConfig;
	}

	/**
	 * Validates that the existing tsdoc.json matches the expected configuration.
	 * Used in CI environments to ensure the committed config is up-to-date.
	 *
	 * @param options - TSDoc options to build expected configuration
	 * @param configPath - Path to the existing tsdoc.json file
	 * @throws Error if the file doesn't exist, can't be parsed, or doesn't match
	 */
	static async validateConfigFile(options: TsDocOptions = {}, configPath: string): Promise<void> {
		const expectedConfig = TsDocConfigBuilder.buildConfigObject(options);

		if (!existsSync(configPath)) {
			throw new Error(
				`tsdoc.json not found at ${configPath}. Run the build locally to generate it, then commit the file.`,
			);
		}

		let existingConfig: unknown;
		try {
			const existingContent = await readFile(configPath, "utf-8");
			existingConfig = JSON.parse(existingContent);
		} catch (error) {
			throw new Error(
				`Failed to parse existing tsdoc.json at ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}

		if (!deepEqual(existingConfig, expectedConfig, { strict: true })) {
			throw new Error(
				`tsdoc.json is out of date. Run the build locally to regenerate it, then commit the changes.\n` +
					`Expected:\n${JSON.stringify(expectedConfig, null, 2)}\n\n` +
					`Actual:\n${JSON.stringify(existingConfig, null, 2)}`,
			);
		}
	}

	/**
	 * Generates a tsdoc.json file from options.
	 *
	 * @remarks
	 * When all groups are enabled (default), generates a minimal config with
	 * `noStandardTags: false` so TSDoc automatically loads all standard tags.
	 * Only custom tags need to be defined in this case.
	 *
	 * When a subset of groups is specified, generates a config with
	 * `noStandardTags: true` and explicitly defines only the tags from
	 * the enabled groups.
	 *
	 * In CI environments (`CI` or `GITHUB_ACTIONS` env vars set to "true"),
	 * this method validates the existing file instead of writing, throwing
	 * an error if the config is out of date. Set `skipCIValidation` to true
	 * to skip this validation (useful when `persistConfig: false`).
	 *
	 * @param options - TSDoc configuration options
	 * @param outputDir - Directory to write the config file
	 * @param skipCIValidation - Skip CI validation even in CI environments
	 */
	static async writeConfigFile(
		options: TsDocOptions = {},
		outputDir: string,
		skipCIValidation = false,
	): Promise<string> {
		const configPath = join(outputDir, "tsdoc.json");

		// In CI, validate instead of write (unless explicitly skipped)
		if (TsDocConfigBuilder.isCI() && !skipCIValidation) {
			await TsDocConfigBuilder.validateConfigFile(options, configPath);
			return configPath;
		}

		const tsdocConfig = TsDocConfigBuilder.buildConfigObject(options);

		// Check if file exists and compare objects to avoid unnecessary writes
		if (existsSync(configPath)) {
			try {
				const existingContent = await readFile(configPath, "utf-8");
				const existingConfig = JSON.parse(existingContent);
				// Deep compare objects - if equal, skip writing
				if (deepEqual(existingConfig, tsdocConfig, { strict: true })) {
					return configPath;
				}
			} catch {
				// If we can't read/parse the existing file, just write the new one
			}
		}

		// Format with tabs and trailing newline
		await writeFile(configPath, `${JSON.stringify(tsdocConfig, null, "\t")}\n`);
		return configPath;
	}

	/** Converts TSDocTagSyntaxKind enum to string format. */
	private static syntaxKindToString(kind: TSDocTagSyntaxKind): "block" | "inline" | "modifier" {
		switch (kind) {
			case TSDocTagSyntaxKind.InlineTag:
				return "inline";
			case TSDocTagSyntaxKind.BlockTag:
				return "block";
			case TSDocTagSyntaxKind.ModifierTag:
				return "modifier";
		}
	}
}

/**
 * A declarative rule for suppressing a specific API Extractor warning message.
 *
 * @remarks
 * Both `messageId` and `pattern` must match when both are specified (AND logic).
 * Specify at least one field per rule — a rule with neither field matches all messages.
 *
 * `pattern` is first tried as a RegExp. If the string is not a valid regular
 * expression it falls back to substring matching.
 *
 * @public
 */
export interface WarningSuppressionRule {
	/**
	 * Exact match against the message's `messageId` property
	 * (e.g., `"ae-forgotten-export"`, `"tsdoc-param-tag-missing-hyphen"`).
	 */
	messageId?: string;

	/**
	 * Pattern matched against the message's `text` property.
	 * Tried as a RegExp first; falls back to case-sensitive substring match.
	 */
	pattern?: string;
}

/**
 * Options for API model generation.
 * Generates an `<unscopedPackageName>.api.json` file using API Extractor.
 *
 * @remarks
 * API model generation is enabled by default. To disable, set `apiModel: false`.
 * Providing an options object implicitly enables API model generation.
 *
 * When a package has multiple entry points, API Extractor runs for each entry and the
 * resulting per-entry models are merged into a single API model with multiple
 * EntryPoint members. Canonical references are scoped per entry point.
 *
 * @public
 */
export interface ApiModelOptions {
	/**
	 * Filename for the generated API model file.
	 * @defaultValue `<unscopedPackageName>.api.json` (e.g., `rslib-builder.api.json`)
	 */
	filename?: string;

	/**
	 * Local paths to copy the API model and package.json to.
	 * Used for local testing with documentation systems.
	 *
	 * @remarks
	 * Each path must be a directory. The parent directory must exist,
	 * but the final directory will be created if it doesn't exist.
	 * Both the API model and the processed package.json will be copied.
	 *
	 * The API model file is emitted to dist but excluded from npm publish
	 * (added as negated pattern `!<filename>` in the `files` array).
	 *
	 * @example
	 * ```typescript
	 * import type { ApiModelOptions } from '@savvy-web/rslib-builder';
	 *
	 * const apiModel: ApiModelOptions = {
	 *   localPaths: ['../docs-site/lib/packages/my-package'],
	 * };
	 * ```
	 */
	localPaths?: string[];

	/**
	 * TSDoc configuration for custom tag definitions.
	 * Passed to API Extractor for documentation processing.
	 *
	 * @remarks
	 * By default, all standard tag groups (core, extended, discretionary) are
	 * enabled. Custom tags defined in `tagDefinitions` are automatically
	 * supported. Use `supportForTags` only to disable specific tags.
	 *
	 * @example
	 * ```typescript
	 * import type { ApiModelOptions } from '@savvy-web/rslib-builder';
	 *
	 * const apiModel: ApiModelOptions = {
	 *   tsdoc: {
	 *     tagDefinitions: [{ tagName: '@error', syntaxKind: 'inline' }],
	 *   },
	 * };
	 * ```
	 */
	tsdoc?: TsDocOptions;

	/**
	 * Options for tsdoc-metadata.json generation.
	 * @defaultValue true (enabled when apiModel is enabled)
	 */
	tsdocMetadata?: TsDocMetadataOptions | boolean;

	/**
	 * Controls handling of API Extractor's "forgotten export" messages.
	 * A forgotten export occurs when a public API references a declaration
	 * that isn't exported from the entry point.
	 *
	 * - `"include"`: Log a warning, include in the API model
	 * - `"error"`: Fail the build with details about the forgotten exports
	 * - `"ignore"`: Turn off detection — suppress all messages
	 *
	 * @defaultValue `"error"` in CI environments (`CI` or `GITHUB_ACTIONS` env vars),
	 *               `"include"` otherwise
	 */
	forgottenExports?: "include" | "error" | "ignore";

	/**
	 * Declarative rules for suppressing specific API Extractor warning messages.
	 *
	 * @remarks
	 * Each rule matches on `messageId` (exact), `pattern` (RegExp with substring fallback),
	 * or both (AND logic). Suppression is evaluated before `forgottenExports` and TSDoc
	 * warning handling and takes priority over both.
	 *
	 * After each entry, the number of suppressed messages is logged at info level.
	 *
	 * @example
	 * ```typescript
	 * import type { ApiModelOptions } from '@savvy-web/rslib-builder';
	 *
	 * const apiModel: ApiModelOptions = {
	 *   forgottenExports: 'error',
	 *   suppressWarnings: [
	 *     // Suppress forgotten-export for Effect _base symbols
	 *     { messageId: 'ae-forgotten-export', pattern: '_base' },
	 *     // Suppress a specific TSDoc warning category
	 *     { messageId: 'tsdoc-param-tag-missing-hyphen' },
	 *   ],
	 * };
	 * ```
	 */
	suppressWarnings?: WarningSuppressionRule[];
}

/**
 * Extracts the unscoped package name from a potentially scoped package name.
 * @param name - The package name (e.g., `@scope/package` or `package`)
 * @returns The unscoped name (e.g., `package`)
 * @internal
 */
export function getUnscopedPackageName(name: string): string {
	return name.startsWith("@") ? (name.split("/")[1] ?? name) : name;
}

/**
 * Options for configuring the DTS plugin.
 * @public
 */
export interface DtsPluginOptions {
	/**
	 * Path to TypeScript configuration file.
	 * If not specified, uses the tsconfigPath from Rsbuild config or searches for tsconfig.json.
	 */
	tsconfigPath?: string;

	/**
	 * Custom output directory for declaration files relative to dist root.
	 * If not specified, uses the declarationDir from tsconfig.json or falls back to dist root.
	 */
	distPath?: string;

	/**
	 * Whether to abort the build on TypeScript errors.
	 * @defaultValue true
	 */
	abortOnError?: boolean;

	/**
	 * Custom file extension for declaration files.
	 * @defaultValue ".d.ts"
	 */
	dtsExtension?: string;

	/**
	 * Whether to bundle declaration files using API Extractor.
	 * When true, generates a single .d.ts file per entry point.
	 * @defaultValue false
	 */
	bundle?: boolean;

	/**
	 * Packages whose types should be bundled (inlined) into the output .d.ts files.
	 * Only applies when bundle is true.
	 * Supports glob patterns (e.g., '\@commitlint/*', 'type-fest')
	 * @defaultValue []
	 */
	bundledPackages?: string[];

	/**
	 * Banner text to add at the top of bundled declaration files.
	 * Only applies when bundle is true.
	 */
	banner?: string;

	/**
	 * Footer text to add at the bottom of bundled declaration files.
	 * Only applies when bundle is true.
	 */
	footer?: string;

	/**
	 * Build mode (dev, npm).
	 * Used to generate the correct temp tsconfig when tsconfigPath is not provided.
	 */
	buildMode?: "dev" | "npm";

	/**
	 * Output format for the library.
	 * Affects the resolved tsconfig.json module settings:
	 * - `"esm"`: Uses ESNext module and Bundler resolution (default)
	 * - `"cjs"`: Uses CommonJS module and Node10 resolution
	 */
	format?: "esm" | "cjs";

	/**
	 * Options for API model generation.
	 * When enabled, generates an `<unscopedPackageName>.api.json` file in the dist directory.
	 * Only applies when bundle is true.
	 *
	 * The API model is excluded from npm publish (not added to `files` array).
	 */
	apiModel?: ApiModelOptions | boolean;

	/**
	 * Path prefix for emitted DTS files.
	 * Used in dual format builds to place declarations in format subdirectories
	 * (e.g., `esm/index.d.ts`, `cjs/index.d.cts`).
	 * Metadata files (api.json, tsdoc-metadata.json, tsconfig.json) are NOT prefixed.
	 */
	dtsPathPrefix?: string;
}

/**
 * Gets the path to the tsgo (TypeScript native compiler) executable.
 * Uses workspace-tools to find the workspace root and searches for tsgo binary.
 * Supports npm, pnpm, yarn, rush, and lerna workspaces.
 * @returns The absolute path to the tsgo binary
 * @internal
 */
export function getTsgoBinPath(): string {
	const cwd = process.cwd();

	// First, try the current package's node_modules
	const localTsgoBin = join(cwd, "node_modules", ".bin", "tsgo");
	if (existsSync(localTsgoBin)) {
		return localTsgoBin;
	}

	// If not found locally, use workspace-tools to find the workspace root
	// This handles pnpm, npm, yarn, rush, and lerna workspaces
	const workspaceRoot = getWorkspaceManagerRoot(cwd);
	/* v8 ignore start -- Workspace fallback difficult to test without mocking workspace-tools */
	if (workspaceRoot) {
		const workspaceTsgoBin = join(workspaceRoot, "node_modules", ".bin", "tsgo");
		if (existsSync(workspaceTsgoBin)) {
			return workspaceTsgoBin;
		}
	}
	/* v8 ignore stop */

	// Fallback to current directory (will error with a clear message if not found)
	return localTsgoBin;
}

/**
 * Generates command-line arguments for tsgo.
 *
 * @internal
 */
export function generateTsgoArgs(options: {
	configPath: string;
	declarationDir: string;
	rootDir?: string;
	tsBuildInfoFile?: string;
}): string[] {
	const { configPath, declarationDir, rootDir, tsBuildInfoFile } = options;

	const args = [
		"--project",
		configPath,
		"--declaration",
		"--emitDeclarationOnly",
		"--declarationMap",
		"--declarationDir",
		declarationDir,
	];

	if (rootDir) {
		args.push("--rootDir", rootDir);
	}

	if (tsBuildInfoFile) {
		args.push("--tsBuildInfoFile", tsBuildInfoFile);
	}

	return args;
}

/**
 * Recursively collects all .d.ts and .d.ts.map files from a directory.
 *
 * @internal
 */
export async function collectDtsFiles(
	dir: string,
	baseDir: string = dir,
): Promise<Array<{ path: string; relativePath: string }>> {
	const files: Array<{ path: string; relativePath: string }> = [];

	async function walk(currentDir: string): Promise<void> {
		const entries = await readdir(currentDir, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = join(currentDir, entry.name);

			if (entry.isDirectory()) {
				await walk(fullPath);
			} else if (entry.name.endsWith(".d.ts") || entry.name.endsWith(".d.ts.map")) {
				const relativePath = relative(baseDir, fullPath);
				files.push({ path: fullPath, relativePath });
			}
		}
	}

	await walk(dir);
	return files;
}

/**
 * Result of bundling declaration files.
 * @internal
 */
interface BundleDtsResult {
	/** Map of entry names to their bundled file paths in temp */
	bundledFiles: Map<string, string>;
	/** Map of entry names to their generated API model file paths (if apiModel was enabled) */
	apiModelPaths: Map<string, string>;
	/** Path to the generated tsdoc-metadata.json file (if enabled) */
	tsdocMetadataPath?: string;
	/** Path to the persisted tsdoc.json file (if persistConfig was enabled) */
	tsdocConfigPath?: string;
}

/**
 * Resolves the tsdoc-metadata.json filename from API model options.
 * @internal
 */
/* v8 ignore start -- Only called from integration code (bundleDtsFiles, processAssets) */
function resolveTsdocMetadataFilename(apiModel: ApiModelOptions | boolean | undefined): string {
	const option = typeof apiModel === "object" ? apiModel.tsdocMetadata : undefined;
	return typeof option === "object" && option.filename ? option.filename : "tsdoc-metadata.json";
}
/* v8 ignore stop */

/**
 * Bundles TypeScript declaration files using API Extractor.
 * Writes bundled output to a temporary directory (not dist).
 * Returns a map of entry names to their bundled file paths in temp.
 * @internal
 */
/* v8 ignore start -- Integration function requiring API Extractor */
async function bundleDtsFiles(options: {
	cwd: string;
	tempDtsDir: string;
	tempOutputDir: string;
	tsconfigPath: string;
	bundledPackages: string[];
	entryPoints: Map<string, string>;
	banner?: string;
	footer?: string;
	apiModel?: ApiModelOptions | boolean;
	format?: "esm" | "cjs";
	buildMode?: "dev" | "npm";
}): Promise<BundleDtsResult> {
	const { cwd, tempDtsDir, tempOutputDir, tsconfigPath, bundledPackages, entryPoints, banner, footer, apiModel } =
		options;

	const bundledFiles = new Map<string, string>();
	const apiModelPaths = new Map<string, string>();
	let tsdocMetadataPath: string | undefined;

	// apiModel is enabled when it's true or an object (any object implicitly enables)
	// API model generation is only performed in npm mode; warning settings apply in all modes
	const apiModelEnabled = (apiModel === true || typeof apiModel === "object") && options.buildMode !== "dev";

	// TSDoc options from apiModel
	const tsdocOptions = typeof apiModel === "object" ? apiModel.tsdoc : undefined;
	const tsdocMetadataOption = typeof apiModel === "object" ? apiModel.tsdocMetadata : undefined;
	// Default: "fail" in CI, "log" locally (user can override with explicit value)
	const tsdocWarnings = tsdocOptions?.warnings ?? (TsDocConfigBuilder.isCI() ? "fail" : "log");
	// Default: "error" in CI, "include" locally (user can override with explicit value)
	const forgottenExports =
		(typeof apiModel === "object" ? apiModel.forgottenExports : undefined) ??
		(TsDocConfigBuilder.isCI() ? "error" : "include");
	const suppressWarnings = typeof apiModel === "object" ? (apiModel.suppressWarnings ?? []) : [];
	const suppressor = createMessageSuppressor(suppressWarnings);

	// tsdocMetadata defaults to enabled when apiModel is enabled
	const tsdocMetadataEnabled =
		apiModelEnabled &&
		(tsdocMetadataOption === undefined ||
			tsdocMetadataOption === true ||
			(typeof tsdocMetadataOption === "object" && tsdocMetadataOption.enabled !== false));
	const tsdocMetadataFilename = resolveTsdocMetadataFilename(apiModel);

	// Validate that API Extractor is installed before attempting import
	getApiExtractorPath();

	// Determine TSDoc config output path and CI validation behavior
	const lintConfig = typeof tsdocOptions?.lint === "object" ? tsdocOptions.lint : undefined;
	const persistConfig = lintConfig?.persistConfig;
	const tsdocConfigOutputPath = TsDocConfigBuilder.getConfigPath(persistConfig, cwd);
	const skipCIValidation = persistConfig === false;

	// Generate tsdoc.json config file for API Extractor
	// Write to the determined path (project root by default, or custom path)
	let tsdocConfigPath: string | undefined;
	let tsdocConfigFile: unknown; // TSDocConfigFile type from @microsoft/tsdoc-config
	if (apiModelEnabled) {
		tsdocConfigPath = await TsDocConfigBuilder.writeConfigFile(
			tsdocOptions ?? {},
			dirname(tsdocConfigOutputPath),
			skipCIValidation,
		);

		// Load the TSDocConfigFile object for API Extractor
		// Use loadForFolder to properly resolve the config from the project directory
		const { TSDocConfigFile } = await import("@microsoft/tsdoc-config");
		tsdocConfigFile = TSDocConfigFile.loadForFolder(dirname(tsdocConfigPath));
	}

	const { Extractor, ExtractorConfig, ExtractorMessage, ExtractorLogLevel } = await import("@microsoft/api-extractor");

	// Process each entry point
	for (const [entryName, sourcePath] of entryPoints) {
		// Determine the .d.ts file path for this entry in temp directory
		// When tsgo runs with --rootDir, it generates files relative to that root
		// Example: sourcePath = "./src/rslib/index.ts" -> try "rslib/index.d.ts" (without src/)
		const normalizedSourcePath = sourcePath.replace(/^\.\//, "");
		const dtsFileName = normalizedSourcePath.replace(/\.(tsx?|jsx?)$/, ".d.ts");
		let tempDtsPath = join(tempDtsDir, dtsFileName);

		// Check if the file exists; if not, try stripping common prefixes like "src/"
		try {
			await access(tempDtsPath, constants.F_OK);
		} catch {
			// File doesn't exist at the direct path, try stripping "src/" prefix
			const withoutSrc = dtsFileName.replace(/^src\//, "");
			if (withoutSrc !== dtsFileName) {
				const alternativePath = join(tempDtsDir, withoutSrc);
				try {
					await access(alternativePath, constants.F_OK);
					// File exists at alternative path, use it
					tempDtsPath = alternativePath;
				} catch {
					// File doesn't exist at either path, use original
					// Will error in API Extractor with a clear message
				}
			}
		}

		// Output path for the bundled declaration file in temp directory
		// Always use flat structure: index.d.ts, hooks.d.ts, rslib/index.d.ts
		// For CJS format, use .d.cts extension
		const dtsExtension = options.format === "cjs" ? ".d.cts" : ".d.ts";
		const outputFileName = `${entryName}${dtsExtension}`;
		const tempBundledPath = join(tempOutputDir, outputFileName);

		// Generate API model for ALL entries when apiModel is enabled
		const isMainEntry = entryName === "index" || entryPoints.size === 1;
		const generateApiModel = apiModelEnabled;
		const tempApiModelPath = generateApiModel ? join(tempOutputDir, `${entryName}.api.json`) : undefined;

		// Generate tsdocMetadata only for the main entry
		const generateTsdocMetadata = tsdocMetadataEnabled && isMainEntry;
		const tempTsdocMetadataPath = generateTsdocMetadata ? join(tempOutputDir, tsdocMetadataFilename) : undefined;

		// Create API Extractor configuration
		type PrepareOptions = Parameters<typeof ExtractorConfig.prepare>[0];
		const prepareOptions: PrepareOptions = {
			configObject: {
				projectFolder: cwd,
				mainEntryPointFilePath: tempDtsPath,
				enumMemberOrder: "preserve" as NonNullable<PrepareOptions["configObject"]["enumMemberOrder"]>,
				compiler: {
					tsconfigFilePath: tsconfigPath,
				},
				dtsRollup: {
					enabled: true,
					untrimmedFilePath: tempBundledPath,
				},
				...(generateApiModel && {
					docModel: {
						enabled: true as const,
						...(tempApiModelPath && { apiJsonFilePath: tempApiModelPath }),
					},
				}),
				...(generateTsdocMetadata && {
					tsdocMetadata: {
						enabled: true as const,
						...(tempTsdocMetadataPath && { tsdocMetadataFilePath: tempTsdocMetadataPath }),
					},
				}),
				bundledPackages,
			},
			packageJsonFullPath: join(cwd, "package.json"),
			configObjectFullPath: undefined,
		};
		if (tsdocConfigFile) {
			prepareOptions.tsdocConfigFile = tsdocConfigFile as NonNullable<PrepareOptions["tsdocConfigFile"]>;
		}
		const extractorConfig = ExtractorConfig.prepare(prepareOptions);

		// Collect TSDoc warnings if needed
		interface TsDocWarning {
			text: string;
			sourceFilePath?: string;
			sourceFileLine?: number;
			sourceFileColumn?: number;
		}
		const collectedTsdocWarnings: TsDocWarning[] = [];
		const collectedForgottenExports: TsDocWarning[] = [];
		const suppressedMessages: string[] = [];

		// Run API Extractor
		const extractorResult = Extractor.invoke(extractorConfig, {
			localBuild: true,
			showVerboseMessages: false,
			messageCallback: (message: InstanceType<typeof ExtractorMessage>) => {
				// User-defined suppression rules — checked first, take priority over all other handling
				if (suppressor.matches(message.messageId, message.text)) {
					message.logLevel = ExtractorLogLevel.None;
					suppressedMessages.push(`[${message.messageId ?? "unknown"}] ${message.text ?? ""}`);
					return;
				}

				// Suppress TypeScript version mismatch warnings
				if (
					message.text?.includes("Analysis will use the bundled TypeScript version") ||
					message.text?.includes("The target project appears to use TypeScript")
				) {
					message.logLevel = ExtractorLogLevel.None;
					return;
				}

				// Suppress API signature change warnings
				if (message.text?.includes("You have changed the public API signature")) {
					message.logLevel = ExtractorLogLevel.None;
					return;
				}

				// Handle TSDoc warnings based on the warnings option
				// TSDoc messages have messageId starting with "tsdoc-"
				const isTsdocMessage = message.messageId?.startsWith("tsdoc-");
				if (isTsdocMessage && message.text) {
					if (tsdocWarnings === "none") {
						message.logLevel = ExtractorLogLevel.None;
					} else {
						// Collect for logging or failing (with location info if available)
						collectedTsdocWarnings.push({
							text: message.text,
							...(message.sourceFilePath != null && { sourceFilePath: message.sourceFilePath }),
							...(message.sourceFileLine != null && { sourceFileLine: message.sourceFileLine }),
							...(message.sourceFileColumn != null && { sourceFileColumn: message.sourceFileColumn }),
						});
						// Still suppress from API Extractor's default output - we'll handle it ourselves
						message.logLevel = ExtractorLogLevel.None;
					}
				}

				// Handle forgotten export messages based on the forgottenExports option
				if (message.messageId === "ae-forgotten-export" && message.text) {
					if (forgottenExports === "ignore") {
						message.logLevel = ExtractorLogLevel.None;
					} else {
						// Collect for warning or failing — we handle output ourselves
						collectedForgottenExports.push({
							text: message.text,
							...(message.sourceFilePath != null && { sourceFilePath: message.sourceFilePath }),
							...(message.sourceFileLine != null && { sourceFileLine: message.sourceFileLine }),
							...(message.sourceFileColumn != null && { sourceFileColumn: message.sourceFileColumn }),
						});
						message.logLevel = ExtractorLogLevel.None;
					}
				}
			},
		});

		if (!extractorResult.succeeded) {
			throw new Error(`API Extractor failed for entry "${entryName}"`);
		}

		// Report suppressed messages
		if (suppressedMessages.length > 0) {
			const list = suppressedMessages.map((t) => `  ${color.dim(t)}`).join("\n");
			logger.info(
				`Suppressed ${suppressedMessages.length} API Extractor message${suppressedMessages.length === 1 ? "" : "s"} for entry "${entryName}":\n${list}`,
			);
		}

		// Format warnings with location info when available
		const formatWarning = (warning: TsDocWarning): string => {
			const location = warning.sourceFilePath
				? `${color.cyan(relative(cwd, warning.sourceFilePath))}${warning.sourceFileLine ? `:${warning.sourceFileLine}` : ""}${warning.sourceFileColumn ? `:${warning.sourceFileColumn}` : ""}`
				: null;
			return location ? `${location}: ${color.yellow(warning.text)}` : color.yellow(warning.text);
		};

		// Handle collected TSDoc warnings
		if (collectedTsdocWarnings.length > 0) {
			// Separate first-party (project source) from third-party (node_modules) warnings
			const isThirdParty = (warning: TsDocWarning): boolean =>
				warning.sourceFilePath?.includes("node_modules/") ?? false;

			const firstPartyWarnings = collectedTsdocWarnings.filter((w) => !isThirdParty(w));
			const thirdPartyWarnings = collectedTsdocWarnings.filter(isThirdParty);

			// Third-party warnings are always logged (never fail) since we can't fix them
			if (thirdPartyWarnings.length > 0) {
				const thirdPartyMessages = thirdPartyWarnings.map(formatWarning).join("\n  ");
				logger.warn(
					`TSDoc warnings from dependencies for entry "${entryName}" (cannot be fixed, bundled types may have documentation issues):\n  ${thirdPartyMessages}`,
				);
			}

			// First-party warnings respect the warnings setting
			if (firstPartyWarnings.length > 0) {
				const firstPartyMessages = firstPartyWarnings.map(formatWarning).join("\n  ");
				if (tsdocWarnings === "fail") {
					throw new Error(`TSDoc validation failed for entry "${entryName}":\n  ${firstPartyMessages}`);
				} else if (tsdocWarnings === "log") {
					logger.warn(`TSDoc warnings for entry "${entryName}":\n  ${firstPartyMessages}`);
				}
			}
		}

		// Handle collected forgotten export messages
		if (collectedForgottenExports.length > 0) {
			const forgottenMessages = collectedForgottenExports.map(formatWarning).join("\n  ");
			if (forgottenExports === "error") {
				throw new Error(`Forgotten exports detected for entry "${entryName}":\n  ${forgottenMessages}`);
			} else if (forgottenExports === "include") {
				logger.warn(`Forgotten exports for entry "${entryName}":\n  ${forgottenMessages}`);
			}
		}

		// Store the API model path if generated
		if (generateApiModel && tempApiModelPath) {
			apiModelPaths.set(entryName, tempApiModelPath);
		}

		// Store the tsdoc-metadata.json path if generated
		if (generateTsdocMetadata && tempTsdocMetadataPath) {
			tsdocMetadataPath = tempTsdocMetadataPath;
		}

		// Apply banner/footer if specified
		if (banner || footer) {
			let content = await readFile(tempBundledPath, "utf-8");
			if (banner) content = `${banner}\n${content}`;
			if (footer) content = `${content}\n${footer}`;
			await writeFile(tempBundledPath, content, "utf-8");
		}

		// Store the bundled file path
		bundledFiles.set(entryName, tempBundledPath);
	}

	return {
		bundledFiles,
		apiModelPaths,
		...(tsdocMetadataPath && { tsdocMetadataPath }),
		...(tsdocConfigPath && { tsdocConfigPath }),
	};
}
/* v8 ignore stop */

/**
 * Strips sourceMappingURL comment from declaration file content.
 * This removes comments like: `//# source` + `MappingURL=index.d.ts.map`
 *
 * @remarks
 * Source maps are preserved in the temp directory for API Extractor documentation
 * but are excluded from the final dist output to reduce package size.
 *
 * @internal
 */
export function stripSourceMapComment(content: string): string {
	return content.replace(/\/\/# sourceMappingURL=\S+\.d\.c?ts\.map\s*$/gm, "").trim();
}

/**
 * Merges per-entry API models into a single Package with multiple EntryPoint members.
 *
 * @remarks
 * Each per-entry API model is a Package (root object with `kind: "Package"`)
 * whose `members` array contains a single EntryPoint. This function extracts
 * the EntryPoints, rewrites canonical references for sub-entries, and combines
 * them into a single Package with all EntryPoints.
 *
 * @param options - Merge options
 * @returns Merged API model with multiple EntryPoint members
 *
 * @internal
 */
export function mergeApiModels(options: {
	perEntryModels: Map<string, Record<string, unknown>>;
	packageName: string;
	exportPaths: Record<string, string>;
}): Record<string, unknown> {
	const { perEntryModels, packageName, exportPaths } = options;

	if (perEntryModels.size === 0) {
		throw new Error("Cannot merge zero API models");
	}

	// Use metadata from the first model (all identical — same package, same config)
	const firstModel = perEntryModels.values().next().value as Record<string, unknown>;

	// Deep clone the first model to use as the base
	// The root object IS the Package (kind: "Package", members: [EntryPoint])
	const merged = JSON.parse(JSON.stringify(firstModel)) as Record<string, unknown>;

	// Collect all EntryPoint members from each per-entry model
	const entryPointMembers: unknown[] = [];

	for (const [entryName, model] of perEntryModels) {
		// The root is the Package; its members are EntryPoints
		const entryPoints = model.members as unknown[];
		if (!entryPoints || entryPoints.length === 0) continue;

		// Each per-entry model has one EntryPoint in Package.members
		const entryPoint = JSON.parse(JSON.stringify(entryPoints[0])) as Record<string, unknown>;

		// Determine the export path for this entry
		const exportPath = exportPaths[entryName] ?? (entryName === "index" ? "." : `./${entryName}`);
		const isMainEntry = exportPath === ".";

		if (isMainEntry) {
			// Main entry: keep canonical reference as @scope/package!, name ""
			entryPointMembers.unshift(entryPoint);
		} else {
			// Sub-entry: rewrite canonical reference to @scope/package/subpath!
			const subpath = exportPath.replace(/^\.\//, "");
			const originalPrefix = `${packageName}!`;
			const newPrefix = `${packageName}/${subpath}!`;

			entryPoint.canonicalReference = newPrefix;
			entryPoint.name = subpath;

			// Rewrite all canonical references within the entry point's member tree
			rewriteCanonicalReferences(entryPoint, originalPrefix, newPrefix);

			entryPointMembers.push(entryPoint);
		}
	}

	// Replace the Package's members with all EntryPoints
	merged.members = entryPointMembers;

	return merged;
}

/**
 * Recursively rewrites canonical reference strings within an API model member tree.
 * @internal
 */
function rewriteCanonicalReferences(node: unknown, originalPrefix: string, newPrefix: string): void {
	if (!node || typeof node !== "object") return;

	/* v8 ignore start -- Defensive: only called with objects from mergeApiModels */
	if (Array.isArray(node)) {
		for (const item of node) {
			rewriteCanonicalReferences(item, originalPrefix, newPrefix);
		}
		return;
	}
	/* v8 ignore stop */

	const obj = node as Record<string, unknown>;

	// Rewrite canonicalReference on members (but not on the EntryPoint itself — already handled)
	if (typeof obj.canonicalReference === "string" && obj.kind !== "EntryPoint") {
		const ref = obj.canonicalReference as string;
		if (ref.startsWith(originalPrefix)) {
			obj.canonicalReference = ref.replace(originalPrefix, newPrefix);
		}
	}

	// Recurse into members array
	if (Array.isArray(obj.members)) {
		for (const member of obj.members) {
			rewriteCanonicalReferences(member, originalPrefix, newPrefix);
		}
	}
}

/**
 * Ensures a temp directory exists for declaration file generation.
 * @internal
 */
export async function ensureTempDeclarationDir(cwd: string, name: string): Promise<string> {
	const dir = join(cwd, ".rslib", "declarations", name);

	// Clean the directory at the start of the build to remove stale files
	// but preserve it after the build for API Extractor documentation generation
	await rm(dir, { recursive: true, force: true });
	await mkdir(dir, { recursive: true });
	return dir;
}

/**
 * Finds the TypeScript config file.
 * @internal
 */
export function findTsConfig(cwd: string, tsconfigPath?: string): string | null {
	// If a path is provided and it's absolute or exists, use it directly
	if (tsconfigPath && isAbsolute(tsconfigPath) && sys.fileExists(tsconfigPath)) {
		return tsconfigPath;
	}
	// Otherwise, search for the config file starting from cwd
	return findConfigFile(cwd, sys.fileExists.bind(sys), tsconfigPath) ?? null;
}

/**
 * Loads and parses a TypeScript config file.
 * @internal
 */
/* v8 ignore start -- Integration function with TypeScript compiler API */
function loadTsConfig(configPath: string): ParsedCommandLine {
	const configContent = readConfigFile(configPath, sys.readFile.bind(sys));

	if (configContent.error) {
		throw new Error(`Failed to read tsconfig: ${formatDiagnostic(configContent.error, createCompilerHost({}, true))}`);
	}

	const parsedConfig = parseJsonConfigFileContent(configContent.config, sys, dirname(configPath), {}, configPath);

	if (parsedConfig.errors.length > 0) {
		throw new Error(
			`Failed to parse tsconfig: ${parsedConfig.errors.map((err: Diagnostic) => formatDiagnostic(err, createCompilerHost({}, true))).join("\n")}`,
		);
	}

	return parsedConfig;
}
/* v8 ignore stop */

/**
 * Runs tsgo to generate declaration files.
 * @internal
 */
/* v8 ignore start -- Integration function spawning external process */
function runTsgo(options: {
	configPath: string;
	declarationDir: string;
	rootDir?: string;
	tsBuildInfoFile?: string;
	name: string;
}): Promise<{ success: boolean; output: string }> {
	const { configPath, declarationDir, rootDir, tsBuildInfoFile, name } = options;

	const tsgoBinPath = getTsgoBinPath();
	const args = generateTsgoArgs({
		configPath,
		declarationDir,
		...(rootDir && { rootDir }),
		...(tsBuildInfoFile && { tsBuildInfoFile }),
	});

	return new Promise((resolve) => {
		// Spawn tsgo directly (it's a shell script in node_modules/.bin)
		const child = spawn(tsgoBinPath, args, {
			stdio: ["inherit", "pipe", "pipe"],
			shell: false,
		});

		let stdout = "";
		let stderr = "";

		child.stdout?.on("data", (data: Buffer) => {
			const text = data.toString();
			stdout += text;
			logger.info(`${color.dim(`[${name}]`)} ${text.trim()}`);
		});

		child.stderr?.on("data", (data: Buffer) => {
			const text = data.toString();
			stderr += text;
			logger.error(`${color.dim(`[${name}]`)} ${color.red(text.trim())}`);
		});

		child.on("close", (code) => {
			const output = stdout + stderr;
			resolve({
				success: code === 0,
				output,
			});
		});

		child.on("error", (err) => {
			logger.error(`Failed to spawn tsgo: ${err.message}`);
			resolve({
				success: false,
				output: err.message,
			});
		});
	});
}
/* v8 ignore stop */

/**
 * Plugin to generate TypeScript declaration files using tsgo and emit them through Rslib's asset pipeline.
 *
 * @remarks
 * This plugin uses tsgo (`\@typescript/native-preview`) for faster declaration file generation
 * and integrates with Rslib's build system by emitting generated files as compilation assets.
 *
 * ## Features
 *
 * - Uses tsgo exclusively for .d.ts generation (faster than tsc)
 * - Emits .d.ts and .d.ts.map files through Rslib's asset pipeline
 * - Optional bundling with API Extractor for rollup mode
 * - Supports watch mode
 * - Integrates seamlessly with other Rslib plugins
 * - Respects tsconfig.json settings
 *
 * ## Build Workflow
 *
 * 1. **Config Phase** (`modifyRsbuildConfig`):
 *    - Finds and loads tsconfig.json
 *    - Creates temp directory for .d.ts generation
 *    - Validates configuration
 *
 * 2. **Asset Processing Phase** (`processAssets`):
 *    - Cleans temp directory at start of build (to remove stale files)
 *    - Spawns tsgo to generate .d.ts files to temp directory
 *    - Recursively collects all generated .d.ts and .d.ts.map files
 *    - If bundling: uses API Extractor to bundle declarations per entry point
 *    - Emits files through compilation.emitAsset()
 *    - Adds .d.ts files (not .d.ts.map) to the files array for npm publishing
 *    - Preserves temp directory after build for API Extractor documentation generation
 *
 * @param options - Plugin configuration options
 *
 * @example
 * ```typescript
 * import { DtsPlugin } from "@savvy-web/rslib-builder";
 *
 * export default {
 *   plugins: [
 *     DtsPlugin({
 *       abortOnError: true,
 *       bundle: true,
 *       bundledPackages: ['type-fest', '@commitlint/*']
 *     })
 *   ]
 * };
 * ```
 *
 * @public
 */
/* v8 ignore next -- @preserve */
export const DtsPlugin = (options: DtsPluginOptions = {}): RsbuildPlugin => {
	const { abortOnError = true, dtsExtension = ".d.ts" } = options;

	// State shared across hooks
	const state: {
		tsconfigPath: string | null;
		parsedConfig: Awaited<ReturnType<typeof loadTsConfig>> | null;
	} = {
		tsconfigPath: null,
		parsedConfig: null,
	};

	return {
		name: "dts-plugin",
		setup(api: RsbuildPluginAPI): void {
			// Phase 1: Prepare configuration

			api.modifyRsbuildConfig(async (config) => {
				const log = createEnvLogger("dts");
				const cwd = api.context.rootPath;

				try {
					// Always generate a temp config when buildMode is provided
					// This ensures consistent declaration generation regardless of the user's tsconfig setup:
					// 1. The temp config uses absolute paths that work from /tmp
					// 2. It handles packages extending our templates (which use ${configDir})
					// 3. It provides correct typeRoots for Node.js type resolution
					//
					// The user's tsconfig.json is still used by their IDE - this temp config
					// is only for the declaration generation step
					let configTsconfigPath = options.tsconfigPath;

					if (options.buildMode) {
						// Change working directory temporarily to package root so process.cwd() works correctly
						const originalCwd = process.cwd();
						try {
							process.chdir(cwd);
							configTsconfigPath = TSConfigs.node.ecma.lib.writeBundleTempConfig(options.buildMode);
						} finally {
							// Restore original working directory
							process.chdir(originalCwd);
						}
					} else if (!configTsconfigPath) {
						// Fall back to RSLib's detected tsconfig if no buildMode
						configTsconfigPath = config.source?.tsconfigPath;
					}

					// Find tsconfig
					state.tsconfigPath = findTsConfig(cwd, configTsconfigPath);

					if (!state.tsconfigPath) {
						const error = new Error(
							`Failed to resolve tsconfig file ${color.cyan(`"${config.source?.tsconfigPath ?? "tsconfig.json"}"`)} from ${color.cyan(cwd)}. Please ensure that the file exists.`,
						);
						error.stack = "";
						throw error;
					}

					// Load and parse tsconfig
					state.parsedConfig = loadTsConfig(state.tsconfigPath);

					log.global.info(`Using tsconfig: ${color.cyan(relative(cwd, state.tsconfigPath))}`);
				} catch (error) {
					log.global.error("Failed to initialize DTS plugin:", error);
					throw error;
				}

				return config;
			});

			// Phase 2: Generate and emit declaration files
			api.processAssets(
				{
					stage: "pre-process",
				},
				async (context) => {
					if (!state.tsconfigPath || !state.parsedConfig) {
						logger.warn("DTS plugin not properly initialized, skipping declaration generation");
						return;
					}

					const envId = context.compilation?.name || "unknown";
					const log = createEnvLogger(envId);
					const cwd = api.context.rootPath;

					// Create temp directory for this environment
					const tempDtsDir = await ensureTempDeclarationDir(cwd, envId);

					// Get files array for adding .d.ts files (but not .d.ts.map)
					const filesArray = api.useExposed("files-array") as Set<string> | undefined;

					try {
						logger.info(`${color.dim(`[${envId}]`)} Generating declaration files...`);

						// Run tsgo to generate .d.ts files
						const { success, output } = await runTsgo({
							configPath: state.tsconfigPath,
							declarationDir: tempDtsDir,
							...(state.parsedConfig.options.rootDir && { rootDir: state.parsedConfig.options.rootDir }),
							...(state.parsedConfig.options.tsBuildInfoFile && {
								tsBuildInfoFile: state.parsedConfig.options.tsBuildInfoFile,
							}),
							name: envId,
						});

						if (!success) {
							const errorMsg = `TypeScript declaration generation failed:\n${output}`;
							if (abortOnError) {
								throw new Error(errorMsg);
							}
							log.global.error(errorMsg);
							log.global.warn(
								"With `abortOnError` disabled, type errors will not fail the build, but proper type declaration output cannot be guaranteed.",
							);
							return;
						}

						// Collect all generated .d.ts and .d.ts.map files
						const allDtsFiles = await collectDtsFiles(tempDtsDir);

						// Check if API report plugin created a temp api-extractor file
						const apiExtractorMapping = api.useExposed("api-extractor-temp-mapping") as
							| { tempPath: string; originalPath: string }
							| undefined;

						if (apiExtractorMapping) {
							// The temp api-extractor file was created in src/ and compiled by the main tsgo run
							// Find the generated declaration and rename it to match the original path

							// Get the relative path of the temp file from package root
							const tempFileRelative = relative(cwd, apiExtractorMapping.tempPath);

							for (const file of allDtsFiles) {
								// The temp file is like src/api-extractor-abc123.ts
								// which generates src/api-extractor-abc123.d.ts
								const expectedPath = tempFileRelative.replace(/\.ts$/, ".d.ts");
								const expectedMapPath = `${expectedPath}.map`;

								if (file.relativePath === expectedPath || file.relativePath === expectedMapPath) {
									// This is a declaration from the temp file - rename it to the original path
									const ext = file.relativePath.endsWith(".map") ? ".d.ts.map" : ".d.ts";
									const originalDtsPath = apiExtractorMapping.originalPath.replace(/\.ts$/, ext);
									const newPath = join(tempDtsDir, originalDtsPath);

									// Ensure the directory exists
									await mkdir(dirname(newPath), { recursive: true });

									// Copy the file to the new location
									await copyFile(file.path, newPath);
									log.global.info(`Renamed ${file.relativePath} -> ${originalDtsPath} (from temp api-extractor)`);

									// Delete the original temp-named file
									await unlink(file.path);
								}
							}

							// Re-collect files after renaming
							allDtsFiles.length = 0;
							allDtsFiles.push(...(await collectDtsFiles(tempDtsDir)));
						}

						// Filter out test files - we don't want to distribute these
						const dtsFiles = allDtsFiles.filter((file) => {
							const path = file.relativePath;
							return !path.includes("__test__/") && !path.includes(".test.d.ts");
						});

						if (dtsFiles.length === 0) {
							log.global.warn("No declaration files were generated");
							return;
						}

						// Emit individual .d.ts files when not bundling
						if (!options.bundle) {
							let emittedCount = 0;
							for (const file of dtsFiles) {
								// Skip .d.ts.map files - keep them only in temp directory for API Extractor
								if (file.relativePath.endsWith(".d.ts.map")) {
									continue;
								}

								// Determine output path relative to dist
								// Strip 'src/' prefix if present since tsgo preserves source directory structure
								let outputPath = file.relativePath;
								if (outputPath.startsWith("src/")) {
									outputPath = outputPath.slice(4); // Remove 'src/'
								}

								// Apply custom extension if specified and different from default
								if (dtsExtension !== ".d.ts" && outputPath.endsWith(".d.ts")) {
									outputPath = outputPath.replace(/\.d\.ts$/, dtsExtension);
								}

								// Apply dtsPathPrefix for dual format builds
								const prefixedPath = options.dtsPathPrefix ? `${options.dtsPathPrefix}/${outputPath}` : outputPath;

								// Only emit .d.ts for files that have a corresponding .js in the compilation
								// tsgo generates declarations for all files in tsconfig scope, but we only
								// want declarations for files that are in the JS compilation (import graph)
								// Use prefixed path since JS files also have format prefix from distPath.js
								const jsOutputPath = prefixedPath.replace(/\.d\.(ts|mts|cts)$/, ".js");
								if (!context.compilation.assets[jsOutputPath]) {
									continue;
								}

								let content = await readFile(file.path, "utf-8");

								// Strip sourceMappingURL comment before emitting to dist
								content = stripSourceMapComment(content);

								// Create source and emit asset
								const source = new context.sources.OriginalSource(content, prefixedPath);
								context.compilation.emitAsset(prefixedPath, source);
								emittedCount++;

								// Add .d.ts files to files array
								if (filesArray && prefixedPath.endsWith(".d.ts")) {
									filesArray.add(prefixedPath);
								}
							}

							logger.info(
								`${color.dim(`[${envId}]`)} Emitted ${emittedCount} declaration file${emittedCount === 1 ? "" : "s"} through asset pipeline`,
							);
						}

						// Bundle declarations and/or generate API model
						// Runs when: bundle mode (rollup per entry) or API model enabled (multi-entry merge)
						const apiModelEnabled = options.apiModel === true || typeof options.apiModel === "object";
						if (options.bundle || apiModelEnabled) {
							try {
								// Read package.json to discover entry points
								// First check if api-report-plugin exposed a modified version
								const exposedPackageJson = api.useExposed<PackageJson>("api-extractor-package-json");

								let packageJson: PackageJson;
								if (!exposedPackageJson) {
									// No modified version, read from disk
									const packageJsonPath = join(cwd, "package.json");
									const packageJsonContent = await readFile(packageJsonPath, "utf-8");
									packageJson = JSON.parse(packageJsonContent);
								} else {
									log.global.info("Using in-memory package.json from api-report-plugin");
									packageJson = exposedPackageJson;
								}

								// Extract ALL TypeScript exports (skip bin entries)
								const { entries, exportPaths } = new EntryExtractor().extract(packageJson);
								const entryPoints = new Map<string, string>();

								// Get virtual entry names to skip type generation for them
								const virtualEntryNames = api.useExposed<Set<string>>("virtual-entry-names");

								for (const [entryName, sourcePath] of Object.entries(entries)) {
									// Skip bin entries - CLI tools don't need bundled type declarations
									if (entryName.startsWith("bin/")) {
										continue;
									}

									// Skip virtual entries - they don't need type declarations
									if (virtualEntryNames?.has(entryName)) {
										log.global.info(`Skipping type generation for virtual entry: ${entryName}`);
										continue;
									}

									// Only process TypeScript source files (skip JSON, CSS, declaration files, etc.)
									if (!sourcePath.match(/\.(ts|mts|cts|tsx)$/)) {
										continue;
									}

									// Skip test files
									if (sourcePath.includes(".test.") || sourcePath.includes("__test__")) {
										continue;
									}

									// Skip files outside the package root (e.g., temp files in /tmp/)
									const resolvedSourcePath = sourcePath.startsWith(".") ? join(cwd, sourcePath) : sourcePath;
									if (!resolvedSourcePath.startsWith(cwd)) {
										log.global.info(`Skipping export "${entryName}" (source outside package: ${sourcePath})`);
										continue;
									}

									// If this is the temp api-extractor file, use the original path instead
									let finalSourcePath = sourcePath;
									if (apiExtractorMapping && resolvedSourcePath === apiExtractorMapping.tempPath) {
										finalSourcePath = apiExtractorMapping.originalPath;
										log.global.info(`Using original path for api-extractor: ${finalSourcePath}`);
									}

									entryPoints.set(entryName, finalSourcePath);
								}

								if (entryPoints.size === 0) {
									log.global.warn("No TypeScript exports found in package.json, skipping declaration bundling");
								} else {
									// Create temp directory for bundled output
									const tempBundledDir = join(tempDtsDir, "bundled");
									await mkdir(tempBundledDir, { recursive: true });

									// Bundle declarations using API Extractor (writes to temp directory)
									const { bundledFiles, apiModelPaths, tsdocMetadataPath, tsdocConfigPath } = await bundleDtsFiles({
										cwd,
										tempDtsDir,
										tempOutputDir: tempBundledDir,
										tsconfigPath: state.tsconfigPath,
										bundledPackages: options.bundledPackages || [],
										entryPoints,
										...(options.banner && { banner: options.banner }),
										...(options.footer && { footer: options.footer }),
										...(options.apiModel !== undefined && { apiModel: options.apiModel }),
										...(options.format && { format: options.format }),
										...(options.buildMode && { buildMode: options.buildMode }),
									});

									// Merge per-entry API models if multiple entries generated models
									let apiModelPath: string | undefined;
									if (apiModelPaths.size === 1) {
										// Single entry — use as-is
										apiModelPath = apiModelPaths.values().next().value as string;
									} else if (apiModelPaths.size > 1 && packageJson.name) {
										// Multiple entries — merge into one Package with multiple EntryPoints
										logger.info(`${color.dim(`[${envId}]`)} Merging API models from ${apiModelPaths.size} entries...`);
										const perEntryModels = new Map<string, Record<string, unknown>>();
										for (const [entryName, modelPath] of apiModelPaths) {
											const content = await readFile(modelPath, "utf-8");
											perEntryModels.set(entryName, JSON.parse(content));
										}
										const mergedModel = mergeApiModels({
											perEntryModels,
											packageName: packageJson.name,
											exportPaths,
										});
										const mergedPath = join(tempBundledDir, "merged.api.json");
										await writeFile(mergedPath, JSON.stringify(mergedModel, null, 2), "utf-8");
										apiModelPath = mergedPath;
									}

									// Determine DTS extension based on format (CJS uses .d.cts)
									const bundledDtsExtension = options.format === "cjs" ? ".d.cts" : ".d.ts";

									// Emit bundled .d.ts files only in bundle mode (not in virtual-barrel-only mode)
									if (options.bundle) {
										let emittedCount = 0;
										for (const [entryName, tempBundledPath] of bundledFiles) {
											// Determine final output file name
											// Always use flat structure: index.d.ts, hooks.d.ts, foo/bar.d.ts
											// For CJS format, use .d.cts extension
											const bundledFileName = `${entryName}${bundledDtsExtension}`;

											// Apply dtsPathPrefix for dual format builds
											const prefixedBundledFileName = options.dtsPathPrefix
												? `${options.dtsPathPrefix}/${bundledFileName}`
												: bundledFileName;

											// Read from temp and strip sourceMappingURL comment before emitting
											let content = await readFile(tempBundledPath, "utf-8");
											content = stripSourceMapComment(content);
											const source = new context.sources.OriginalSource(content, prefixedBundledFileName);
											context.compilation.emitAsset(prefixedBundledFileName, source);
											emittedCount++;

											// Add .d.ts file to files array (but not .d.ts.map files)
											if (filesArray) {
												filesArray.add(prefixedBundledFileName);
											}
										}

										logger.info(
											`${color.dim(`[${envId}]`)} Emitted ${emittedCount} bundled declaration file${emittedCount === 1 ? "" : "s"} through asset pipeline`,
										);
									}

									// Emit API model file if generated
									if (apiModelPath) {
										// Default filename follows API Extractor convention: <unscopedPackageName>.api.json
										const defaultApiModelFilename = packageJson.name
											? `${getUnscopedPackageName(packageJson.name)}.api.json`
											: "api.json";
										const apiModelFilename =
											typeof options.apiModel === "object" && options.apiModel.filename
												? options.apiModel.filename
												: defaultApiModelFilename;
										const apiModelContent = (await readFile(apiModelPath, "utf-8")).replaceAll("\r\n", "\n");
										const apiModelSource = new context.sources.OriginalSource(apiModelContent, apiModelFilename);
										context.compilation.emitAsset(apiModelFilename, apiModelSource);

										// Add negated pattern to files array to exclude from npm publish
										// The file is still emitted to dist for local tooling use
										if (filesArray) {
											filesArray.add(`!${apiModelFilename}`);
										}

										logger.info(
											`${color.dim(`[${envId}]`)} Emitted API model: ${apiModelFilename} (excluded from npm publish)`,
										);

										// Expose data needed for localPaths copying in onCloseBuild
										// (files are read from dist after build completes, ensuring transformed package.json)
										const localPaths = typeof options.apiModel === "object" ? options.apiModel.localPaths : undefined;

										if (localPaths && localPaths.length > 0 && !TsDocConfigBuilder.isCI()) {
											const localTsdocFilename = resolveTsdocMetadataFilename(options.apiModel);

											api.expose("dts-local-paths-data", {
												localPaths,
												apiModelFilename,
												localTsdocFilename,
												hasTsdocMetadata: !!tsdocMetadataPath,
												hasTsconfig: !!state.parsedConfig && !!state.tsconfigPath,
												cwd,
												distPath: `dist/${options.buildMode ?? envId}`,
											});
										}
									}

									// Emit tsdoc-metadata.json file if generated
									if (tsdocMetadataPath) {
										const tsdocMetadataFilename = resolveTsdocMetadataFilename(options.apiModel);
										const tsdocMetadataContent = (await readFile(tsdocMetadataPath, "utf-8")).replaceAll("\r\n", "\n");
										const tsdocMetadataSource = new context.sources.OriginalSource(
											tsdocMetadataContent,
											tsdocMetadataFilename,
										);
										context.compilation.emitAsset(tsdocMetadataFilename, tsdocMetadataSource);

										// Add to files array for npm publish (TSDoc spec requires this file to be published)
										if (filesArray) {
											filesArray.add(tsdocMetadataFilename);
										}

										logger.info(`${color.dim(`[${envId}]`)} Emitted TSDoc metadata: ${tsdocMetadataFilename}`);
									}

									// Emit tsdoc.json to dist (excluded from npm publish, but available for tooling)
									if (tsdocConfigPath) {
										const tsdocConfigContent = (await readFile(tsdocConfigPath, "utf-8")).replaceAll("\r\n", "\n");
										const tsdocConfigSource = new context.sources.OriginalSource(tsdocConfigContent, "tsdoc.json");
										context.compilation.emitAsset("tsdoc.json", tsdocConfigSource);

										// Add negated pattern to exclude from npm publish
										if (filesArray) {
											filesArray.add("!tsdoc.json");
										}

										logger.info(
											`${color.dim(`[${envId}]`)} Emitted TSDoc config: tsdoc.json (excluded from npm publish)`,
										);
									}

									// Emit resolved tsconfig.json (excluded from npm publish, but available for tooling)
									if (apiModelPath && state.parsedConfig && state.tsconfigPath) {
										const resolver = new TsconfigResolver();
										const resolvedTsconfig = resolver.resolve(state.parsedConfig, cwd, options.format);
										const tsconfigContent = `${JSON.stringify(resolvedTsconfig, null, "\t")}\n`;
										const tsconfigSource = new context.sources.OriginalSource(tsconfigContent, "tsconfig.json");
										context.compilation.emitAsset("tsconfig.json", tsconfigSource);

										// Add negated pattern to exclude from npm publish
										if (filesArray) {
											filesArray.add("!tsconfig.json");
										}

										logger.info(
											`${color.dim(`[${envId}]`)} Emitted resolved tsconfig: tsconfig.json (excluded from npm publish)`,
										);
									}

									// Remove .d.ts.map / .d.cts.map files that Rspack auto-generates for our emitted .d.ts assets
									// We keep .d.ts.map files in the declarations directory for API Extractor, but dont want them in dist
									if (options.bundle) {
										for (const [entryName] of bundledFiles) {
											const bundledFileName = `${entryName}${bundledDtsExtension}`;
											// Use prefixed path for map file cleanup (matches emitted asset path)
											const prefixedBundledFileName = options.dtsPathPrefix
												? `${options.dtsPathPrefix}/${bundledFileName}`
												: bundledFileName;
											const mapFileName = `${prefixedBundledFileName}.map`;

											for (const file of dtsFiles) {
												if (file.relativePath.endsWith(".d.ts.map")) {
													continue;
												}
												let outputPath = file.relativePath;
												if (outputPath.startsWith("src/")) {
													outputPath = outputPath.slice(4);
												}
												if (dtsExtension !== ".d.ts" && outputPath.endsWith(".d.ts")) {
													outputPath = outputPath.replace(/\.d\.ts$/, dtsExtension);
												}
												// Apply prefix for individual DTS map cleanup
												const prefixedOutputPath = options.dtsPathPrefix
													? `${options.dtsPathPrefix}/${outputPath}`
													: outputPath;
												const individualMapFileName = `${prefixedOutputPath}.map`;
												if (context.compilation.assets[individualMapFileName]) {
													delete context.compilation.assets[individualMapFileName];
												}
											}

											if (context.compilation.assets[mapFileName]) {
												delete context.compilation.assets[mapFileName];
											}
										}
									}
								}
							} catch (error) {
								log.global.error("Failed to bundle declaration files:", error);
								if (abortOnError) {
									throw error;
								}
							}
						}
					} catch (error) {
						log.global.error("Failed to generate declaration files:", error);
						if (abortOnError) {
							throw error;
						}
					}
				},
			);
			// Add another hook at a later stage to:
			// 1. Strip sourceMappingURL comments from .d.ts files
			// 2. Remove .d.ts.map files that Rspack auto-generates
			api.processAssets(
				{
					stage: "summarize",
				},
				async (compiler) => {
					const assetsToDelete: string[] = [];

					// Process all .d.ts / .d.cts files to strip sourceMappingURL comments
					for (const assetName in compiler.compilation.assets) {
						if (assetName.endsWith(".d.ts") || assetName.endsWith(".d.cts")) {
							const asset = compiler.compilation.assets[assetName];
							const content = asset.source().toString();

							// Strip sourceMappingURL comment
							const strippedContent = stripSourceMapComment(content);

							// Only update if content changed
							if (strippedContent !== content) {
								const source = new compiler.sources.OriginalSource(strippedContent, assetName);
								compiler.compilation.assets[assetName] = source;
							}
						} else if (assetName.endsWith(".d.ts.map") || assetName.endsWith(".d.cts.map")) {
							// Mark .d.ts.map / .d.cts.map files for deletion
							// We keep these files in the declarations directory for API Extractor documentation
							assetsToDelete.push(assetName);
						}
					}

					// Delete .d.ts.map / .d.cts.map files
					for (const assetName of assetsToDelete) {
						delete compiler.compilation.assets[assetName];
					}
				},
			);

			// Copy files to localPaths after build completes (all files written to dist)
			api.onCloseBuild(async () => {
				const localPathsData = api.useExposed<{
					localPaths: string[];
					apiModelFilename: string;
					localTsdocFilename: string;
					hasTsdocMetadata: boolean;
					hasTsconfig: boolean;
					cwd: string;
					distPath: string;
				}>("dts-local-paths-data");

				if (!localPathsData) {
					return;
				}

				const { localPaths, apiModelFilename, localTsdocFilename, hasTsdocMetadata, hasTsconfig, cwd, distPath } =
					localPathsData;
				const distDir = join(cwd, distPath);

				for (const localPath of localPaths) {
					const resolvedPath = join(cwd, localPath);
					const parentDir = dirname(resolvedPath);

					// Validate parent directory exists
					if (!existsSync(parentDir)) {
						logger.warn(`Skipping local path: parent directory does not exist: ${parentDir}`);
						continue;
					}

					// Collect all files to copy
					const filesToCopy: Array<{ src: string; dest: string; name: string }> = [];

					// API model
					const apiModelSrc = join(distDir, apiModelFilename);
					if (existsSync(apiModelSrc)) {
						filesToCopy.push({
							src: apiModelSrc,
							dest: join(resolvedPath, apiModelFilename),
							name: apiModelFilename,
						});
					}

					// tsdoc-metadata.json
					if (hasTsdocMetadata) {
						const tsdocSrc = join(distDir, localTsdocFilename);
						if (existsSync(tsdocSrc)) {
							filesToCopy.push({
								src: tsdocSrc,
								dest: join(resolvedPath, localTsdocFilename),
								name: localTsdocFilename,
							});
						}
					}

					// tsconfig.json (resolved version from dist)
					if (hasTsconfig) {
						const tsconfigSrc = join(distDir, "tsconfig.json");
						if (existsSync(tsconfigSrc)) {
							filesToCopy.push({
								src: tsconfigSrc,
								dest: join(resolvedPath, "tsconfig.json"),
								name: "tsconfig.json",
							});
						}
					}

					// package.json (transformed version from dist)
					const packageJsonSrc = join(distDir, "package.json");
					if (existsSync(packageJsonSrc)) {
						filesToCopy.push({
							src: packageJsonSrc,
							dest: join(resolvedPath, "package.json"),
							name: "package.json",
						});
					}

					// Create target directory and copy all files
					await mkdir(resolvedPath, { recursive: true });

					for (const file of filesToCopy) {
						const content = await readFile(file.src, "utf-8");
						await writeFile(file.dest, content, "utf-8");
					}

					const fileNames = filesToCopy.map((f) => f.name).join(", ");
					logger.info(`Copied ${fileNames} to: ${localPath}`);
				}
			});
		},
	};
};
