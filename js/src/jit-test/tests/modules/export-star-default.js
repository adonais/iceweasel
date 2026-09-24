// |jit-test| skip-if: getBuildConfiguration("release_or_beta"); --enable-export-star-default

load(libdir + "asserts.js");

function evaluateModule(source) {
  let module = parseModule(source);
  moduleLoadAndLink(module);
  moduleEvaluate(module);
  return module;
}

registerModule(
  "default-source",
  parseModule("export default 1; export const named = 2;")
);
registerModule(
  "export-star-default-reexport",
  parseModule('export * from "default-source";')
);

let taggedModule = registerModule(
  "export-star-default-tag-check",
  parseModule('export * from "default-source";')
);
assertEq(taggedModule.starExportEntries.length, 1);
assertEq(taggedModule.starExportEntries[0].importNameValueType, "all");

let consumer = evaluateModule(`
  import value, * as ns from "export-star-default-reexport";
  import { named } from "export-star-default-reexport";
`);

assertEq(getModuleEnvironmentValue(consumer, "value"), 1);
assertEq(getModuleEnvironmentValue(consumer, "named"), 2);
assertEq(getModuleEnvironmentValue(consumer, "ns").default, 1);

registerModule(
  "named-source",
  parseModule("export const named = 1;")
);
registerModule(
  "export-star-no-default-reexport",
  parseModule('export * from "named-source";')
);

let missingDefault = parseModule(`
  import value from "export-star-no-default-reexport";
`);
assertThrowsInstanceOf(() => moduleLoadAndLink(missingDefault), SyntaxError);

registerModule(
  "default-a",
  parseModule("export default 'a';")
);
registerModule(
  "default-b",
  parseModule("export default 'b';")
);
registerModule(
  "export-star-default-ambiguous",
  parseModule(`
    export * from "default-a";
    export * from "default-b";
  `)
);

let nsConsumer = evaluateModule(`
  import * as ns from "export-star-default-ambiguous";
`);
let ns = getModuleEnvironmentValue(nsConsumer, "ns");
assertEq("default" in ns, false);

let ambiguousDefault = parseModule(`
  import value from "export-star-default-ambiguous";
`);
assertThrowsInstanceOf(() => moduleLoadAndLink(ambiguousDefault), SyntaxError);

registerModule(
  "export-star-default-explicit",
  parseModule(`
    export * from "default-a";
    export * from "default-b";
    export { default } from "default-a";
  `)
);

let explicit = evaluateModule(`
  import value from "export-star-default-explicit";
`);
assertEq(getModuleEnvironmentValue(explicit, "value"), "a");
