/* eslint-disable import/no-unassigned-import, import/no-unresolved */
// The first dependency loads successfully, so it is recorded in this module's
// [[LoadedModules]], while the second one never is.
import "./module_a.mjs";
import "./404.js";

window.evaluatedModules.push("import_404_sibling.mjs");
