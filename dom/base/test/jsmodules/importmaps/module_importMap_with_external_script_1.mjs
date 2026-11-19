// Missing file ./bad/module_1.mjs should be mapped to ./good/module_1.mjs.
// eslint-disable-next-line import-x/no-unassigned-import, import-x/no-unresolved
import {} from "./bad/module_1.mjs";
