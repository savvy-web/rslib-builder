import { inspect } from "node:util";

export function debugLogger(obj: unknown): void {
	console.log(inspect(obj, { depth: null, showHidden: true, colors: true }));
}
