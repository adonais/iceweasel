const count = 10;

let s = "";
for (let i = 0; i < count; i++)
    s += "export let e" + i + " = " + (i * i) + ";\n";
let stencil = compileToStencilXDR(s, {module: true});
let m = instantiateModuleStencilXDR(stencil);
let a = registerModule('a', m);

stencil = compileToStencilXDR("import * as ns from 'a'", {module: true});
m = instantiateModuleStencilXDR(stencil);
let b = registerModule('b', m);

moduleLink(b);
moduleEvaluate(b);

let ns = a.namespace;
for (let i = 0; i < count; i++)
    assertEq(ns["e" + i], i * i);

// export * as ns (Namespace importName value type) survives XDR.
stencil = compileToStencilXDR("export * as ns from 'a';", {module: true});
let c = instantiateModuleStencilXDR(stencil);
registerModule('c', c);

assertEq(c.indirectExportEntries.length, 1);
assertEq(c.indirectExportEntries[0].importName, null);
assertEq(c.indirectExportEntries[0].importNameValueType, 'namespace');

stencil = compileToStencilXDR("import { ns } from 'c';", {module: true});
let d = instantiateModuleStencilXDR(stencil);
moduleLink(d);
moduleEvaluate(d);
let dns = getModuleEnvironmentValue(d, "ns");
for (let i = 0; i < count; i++)
    assertEq(dns["e" + i], i * i);

// export * (AllButDefault importName value type) survives XDR.
stencil = compileToStencilXDR("export * from 'a';", {module: true});
let e = instantiateModuleStencilXDR(stencil);
registerModule('e', e);

assertEq(e.starExportEntries.length, 1);
assertEq(e.starExportEntries[0].importName, null);
assertEq(e.starExportEntries[0].importNameValueType, 'all-but-default');

stencil = compileToStencilXDR("import { e5 } from 'e';", {module: true});
let f = instantiateModuleStencilXDR(stencil);
moduleLink(f);
moduleEvaluate(f);
assertEq(getModuleEnvironmentValue(f, "e5"), 25);
