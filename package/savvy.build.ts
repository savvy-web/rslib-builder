import { defineBuild, runBuild } from "@savvy-web/bundler";

const config = defineBuild({
	devManifest: "preserve",
	meta: {
		...(process.env.RSLIB_BUILDER_LOCAL_PATH && { localPaths: [process.env.RSLIB_BUILDER_LOCAL_PATH] }),
		tsdoc: {
			tagDefinitions: [
				{
					tagName: "@category",
					syntaxKind: "modifier",
				},
				{
					tagName: "@default",
					syntaxKind: "modifier",
				},
			],
		},
	},
});

export default config;

if (import.meta.main) {
	await runBuild(config, { cwd: import.meta.dirname, argv: process.argv.slice(2) });
}
