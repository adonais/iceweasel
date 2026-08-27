function importModule(source) {
    let m = parseModule(source);
    moduleLoadAndLink(m);
    moduleEvaluate(m);
    return m;
}

// A user export/import name spelled like an internal sentinel must behave as an
// ordinary name, not as the namespace/source/all-but-default binding.
registerModule("ns_src", parseModule('var v = 42; export { v as "*namespace*" };'));
let nsImporter = importModule('import { "*namespace*" as foo } from "ns_src";');
assertEq(getModuleEnvironmentValue(nsImporter, "foo"), 42);

registerModule("source_src", parseModule('var w = 7; export { w as "*source*" };'));
let sourceImporter = importModule('import { "*source*" as foo } from "source_src";');
assertEq(getModuleEnvironmentValue(sourceImporter, "foo"), 7);

registerModule("abd_src", parseModule('var u = 5; export { u as "*all-but-default*" };'));
let abdImporter = importModule('import { "*all-but-default*" as foo } from "abd_src";');
assertEq(getModuleEnvironmentValue(abdImporter, "foo"), 5);

// "default" is a real export name; importing it as a string is equivalent to a
// default import.
registerModule("default_src", parseModule('export default 99;'));
let defaultImporter = importModule('import { "default" as foo } from "default_src";');
assertEq(getModuleEnvironmentValue(defaultImporter, "foo"), 99);

// Genuine default import still works and matches the "default" string import.
let defaultDefaultImporter = importModule('import foo from "default_src";');
assertEq(getModuleEnvironmentValue(defaultDefaultImporter, "foo"), 99);

// Re-exporting a sentinel-spelled name must also resolve as an ordinary name.
registerModule("reexport_src", parseModule('var t = 3; export { t as "*namespace*" };'));
registerModule("reexport", parseModule('export { "*namespace*" as out } from "reexport_src";'));
let reexportImporter = importModule('import { out as foo } from "reexport";');
assertEq(getModuleEnvironmentValue(reexportImporter, "foo"), 3);

// importName "*namespace*" here is a named import resolving to a re-exported
// default export, not a namespace import.
registerModule("default_ns_export", parseModule('export default 77;'));
registerModule("default_ns_reexport", parseModule('export { default as "*namespace*" } from "default_ns_export";'));
let namedFromDefaultNs = importModule('import { "*namespace*" as foo } from "default_ns_reexport";');
assertEq(getModuleEnvironmentValue(namedFromDefaultNs, "foo"), 77);

// Likewise importName "*source*" is a named import here, not a source import.
registerModule("default_source_export", parseModule('export default 88;'));
registerModule("default_source_reexport", parseModule('export { default as "*source*" } from "default_source_export";'));
let namedFromDefaultSource = importModule('import { "*source*" as foo } from "default_source_reexport";');
assertEq(getModuleEnvironmentValue(namedFromDefaultSource, "foo"), 88);

// Genuine namespace import and namespace re-export still work.
registerModule("star_src", parseModule('export var gv = 11;'));
let starImporter = importModule('import * as ns from "star_src";');
assertEq(getModuleEnvironmentValue(starImporter, "ns").gv, 11);

registerModule("star_reexport", parseModule('export * as reexportedNs from "star_src";'));
let starReexportImporter = importModule('import { reexportedNs as foo } from "star_reexport";');
assertEq(getModuleEnvironmentValue(starReexportImporter, "foo").gv, 11);

// A string import name that resolves to a genuine namespace binding: the export
// name is spelled "*namespace*" but is really a namespace re-export, so the
// importer must bind the namespace object.
registerModule("nsobj_reexport", parseModule('export * as "*namespace*" from "star_src";'));
let nsobjImporter = importModule('import { "*namespace*" as foo } from "nsobj_reexport";');
assertEq(getModuleEnvironmentValue(nsobjImporter, "foo").gv, 11);

// Genuine `export *` (all-but-default) re-export still works.
registerModule("abd_inner", parseModule('export var abdName = 1; export default 2;'));
registerModule("abd_star", parseModule('export * from "abd_inner";'));
let abdStarImporter = importModule('import { abdName as foo } from "abd_star";');
assertEq(getModuleEnvironmentValue(abdStarImporter, "foo"), 1);
