import { NodeLibraryBuilder } from "@savvy-web/rslib-builder";

// Regression fixture for the dual-format + exportsAsIndexes type-path bug.
// Nested export keys ("./group/alpha") combined with `exportsAsIndexes` and a
// dual ESM/CJS build must produce `types`/`import`/`require` paths that all
// point at files that actually exist (e.g. ./esm/group/alpha/index.d.ts).
export default NodeLibraryBuilder.create({
	format: ["esm", "cjs"],
	exportsAsIndexes: true,
});
