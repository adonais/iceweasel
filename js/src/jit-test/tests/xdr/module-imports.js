const count = 10;

let stencil = compileToStencilXDR("export let a = 1;", {module: true});
let m = instantiateModuleStencilXDR(stencil);
let a = registerModule('a', m);

let s = "";
for (let i = 0; i < count; i++) {
    s += "import { a as i" + i + " } from 'a';\n";
    s += "assertEq(i" + i + ", 1);\n";
}

stencil = compileToStencilXDR(s, {module: true});
m = instantiateModuleStencilXDR(stencil);
let b = registerModule('b', m);

moduleLoadAndLink(b);
moduleEvaluate(b);


stencil = compileToStencilXDR("import * as nsa from 'a'; import * as nsb from 'b';", {module: true});
m = instantiateModuleStencilXDR(stencil);

moduleLoadAndLink(m);
moduleEvaluate(m);

// A named import spelled like the internal "*namespace*" sentinel is a String
// import name, while `import * as` is the Namespace value type. Both must
// survive XDR so the sentinel-spelled string keeps resolving as an ordinary
// export rather than being decoded as a namespace import.
stencil = compileToStencilXDR('export let normal = 7; export { normal as "*namespace*" };', {module: true});
m = instantiateModuleStencilXDR(stencil);
registerModule('c', m);

stencil = compileToStencilXDR('import * as ns from "c"; import { "*namespace*" as sentinelName } from "c";', {module: true});
m = instantiateModuleStencilXDR(stencil);
moduleLoadAndLink(m);
moduleEvaluate(m);
assertEq(getModuleEnvironmentValue(m, "sentinelName"), 7);
let cns = getModuleEnvironmentValue(m, "ns");
assertEq(cns["*namespace*"], 7);
assertEq(cns.normal, 7);
