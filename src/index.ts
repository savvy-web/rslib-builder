/**
 * RSLib-based build system for Node.js libraries with automatic package.json transformation,
 * TypeScript declaration bundling, and multi-target support.
 *
 * @remarks
 * This package provides a powerful builder system built on top of RSLib that simplifies the
 * process of building Node.js libraries. It offers:
 *
 * - **Automatic Entry Detection**: Auto-detects entry points from package.json exports
 * - **Multi-Target Builds**: Support for dev, npm, and jsr build targets
 * - **Bundle Modes**: Both bundled (single-file) and bundleless (per-file) compilation
 * - **Package.json Transformation**: Automatic path updates, PNPM catalog resolution
 * - **TypeScript Declaration Bundling**: Using tsgo and API Extractor
 * - **File Array Generation**: Automatic files array creation for package.json
 * - **JSR Support**: Special handling for JSR (JavaScript Registry) publishing
 *
 * @example
 * Basic usage in rslib.config.ts:
 * ```typescript
 * import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';
 *
 * export default NodeLibraryBuilder.create({
 *   bundle: true,
 *   format: 'esm',
 *   apiReports: true
 * });
 * ```
 *
 * @example
 * With custom transformations:
 * ```typescript
 * import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';
 *
 * export default NodeLibraryBuilder.create({
 *   bundle: true,
 *   externals: ['@rslib/core'],
 *   transform({ pkg }) {
 *     delete pkg.devDependencies;
 *     return pkg;
 *   }
 * });
 * ```
 *
 * @packageDocumentation
 */

/* v8 ignore start - Export module, tested through consuming packages */
export type * from "./rslib/builders/node-library-builder.js";
export * from "./rslib/builders/node-library-builder.js";
export type * from "./rslib/plugins/api-report-plugin.js";
export * from "./rslib/plugins/api-report-plugin.js";
export type * from "./rslib/plugins/auto-entry-plugin.js";
export * from "./rslib/plugins/auto-entry-plugin.js";
export type * from "./rslib/plugins/bundleless-plugin.js";
export * from "./rslib/plugins/bundleless-plugin.js";
export type * from "./rslib/plugins/dts-plugin.js";
export * from "./rslib/plugins/dts-plugin.js";
export type * from "./rslib/plugins/files-array-plugin.js";
export * from "./rslib/plugins/files-array-plugin.js";
export type * from "./rslib/plugins/jsr-bundleless-plugin.js";
export * from "./rslib/plugins/jsr-bundleless-plugin.js";
export type * from "./rslib/plugins/package-json-transform-plugin.js";
export * from "./rslib/plugins/package-json-transform-plugin.js";
/* v8 ignore stop */
