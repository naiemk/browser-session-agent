import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

/** Absolute file URL so `node --import` loads tsx from this package, not cwd. */
export const tsxLoader = pathToFileURL(require.resolve("tsx")).href;
