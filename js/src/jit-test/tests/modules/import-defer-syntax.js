// |jit-test| skip-if: getBuildConfiguration("release_or_beta"); --enable-defer-import-eval

load(libdir + "asserts.js");

const ast = Reflect.parse("import defer * as ns from './module.js'", {target: "module"});
assertEq(ast.type, "Program");
assertEq(ast.body.length, 1);

const importDecl = ast.body[0];
assertEq(importDecl.type, "ImportDeclaration");
assertEq(importDecl.phase, "defer");
assertEq(importDecl.specifiers.length, 1);

const spec = importDecl.specifiers[0];
assertEq(spec.type, "ImportNamespaceSpecifier");
assertEq(spec.name.type, "Identifier");
assertEq(spec.name.name, "ns");

const moduleRequest = importDecl.moduleRequest;
assertEq(moduleRequest.type, "ModuleRequest");
assertEq(moduleRequest.source.type, "Literal");
assertEq(moduleRequest.source.value, "./module.js");
assertEq(moduleRequest.attributes.length, 0);

// Import attributes are allowed on `import defer` declarations.
const astWithAttributes = Reflect.parse(
  "import defer * as ns from './module.js' with { type: 'json' }", {target: "module"});
assertEq(astWithAttributes.body[0].phase, "defer");
const attributes = astWithAttributes.body[0].moduleRequest.attributes;
assertEq(attributes.length, 1);
assertEq(attributes[0].type, "ImportAttribute");
assertEq(attributes[0].key.name, "type");
assertEq(attributes[0].value.value, "json");

// Error outside of module context
assertThrowsInstanceOf(() => Reflect.parse("import defer * as ns from './module.js'"), SyntaxError);

// `import defer` requires a namespace import.
assertThrowsInstanceOf(() => Reflect.parse("import defer mod from './module.js'", {target: "module"}), SyntaxError);
assertThrowsInstanceOf(() => Reflect.parse("import defer { mod } from './module.js'", {target: "module"}), SyntaxError);
assertThrowsInstanceOf(() => Reflect.parse("import defaultBinding, defer * as ns from './module.js'", {target: "module"}), SyntaxError);

// `defer` is a contextual keyword: without a following `*` it is just a
// regular default binding name, like `import source from '...'` in
// import-source-syntax.js.
const plainAst = Reflect.parse("import defer from './module.js'", {target: "module"});
const plainDecl = plainAst.body[0];
// Without a following `*`, this is an ordinary evaluation-phase import, not a
// deferred one.
assertEq(plainDecl.phase, "evaluation");
const plainSpec = plainDecl.specifiers[0];
assertEq(plainSpec.type, "ImportSpecifier");
assertEq(plainSpec.id.name, "default");
assertEq(plainSpec.name.name, "defer");
