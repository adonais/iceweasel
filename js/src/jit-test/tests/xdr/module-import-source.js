// |jit-test| skip-if: !getBuildConfiguration("source-phase-imports"); --enable-source-phase-imports

// A source-phase import records ImportNameValueType::Source with a null
// importName; both must survive the XDR round-trip.
let stencil = compileToStencilXDR('import source mod from "a";', {module: true});
let m = instantiateModuleStencilXDR(stencil);
assertEq(m.importEntries.length, 1);
assertEq(m.importEntries[0].importName, null);
assertEq(m.importEntries[0].importNameValueType, 'source');
