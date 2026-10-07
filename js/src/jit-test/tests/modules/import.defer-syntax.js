// |jit-test| skip-if: getBuildConfiguration("release_or_beta"); --enable-defer-import-eval

load(libdir + "asserts.js");

const ast = Reflect.parse("import.defer('module.js')");
assertEq(ast.type, "Program");
assertEq(ast.body.length, 1);
assertEq(ast.body[0].type, "ExpressionStatement");
assertEq(ast.body[0].expression.type, "CallImport");
assertEq(ast.body[0].expression.phase, "defer");
assertEq(ast.body[0].expression.ident.type, "Identifier");
assertEq(ast.body[0].expression.ident.name, "import");
assertEq(ast.body[0].expression.arguments.length, 1);
assertEq(ast.body[0].expression.arguments[0].type, "Literal");
assertEq(ast.body[0].expression.arguments[0].value, "module.js");

// `import.defer` accepts an optional second (import attributes) argument,
// like plain dynamic `import()`.
const astWithOptions = Reflect.parse("import.defer('module.js', {with: {type: 'json'}})");
assertEq(astWithOptions.body[0].expression.phase, "defer");
const args = astWithOptions.body[0].expression.arguments;
assertEq(args.length, 2);
assertEq(args[1].type, "ObjectExpression");

// Plain dynamic `import()` is an evaluation-phase call: the `phase` property
// distinguishes it from `import.defer(...)`.
const plainImport = Reflect.parse("import('module.js')");
assertEq(plainImport.body[0].expression.type, "CallImport");
assertEq(plainImport.body[0].expression.phase, "evaluation");

Reflect.parse("while (false) {import.defer('<module defer>');};");
Reflect.parse("function fn() { import.defer('module.js'); }");
Reflect.parse("const fn = () => import.defer('module.js');");
Reflect.parse("for (let i = 0; i < 10; i++) { import.defer('module.js'); }");
Reflect.parse("for (const x of [1, 2, 3]) { import.defer('module.js'); }");
Reflect.parse("for (const key in {a: 1}) { import.defer('module.js'); }");
Reflect.parse("if (true) { import.defer('module.js'); }");
Reflect.parse("if (false) {} else { import.defer('module.js'); }");
Reflect.parse("try { import.defer('module.js'); } catch (e) {}");
Reflect.parse("try {} catch (e) { import.defer('module.js'); }");
Reflect.parse("const mod = 'test'; import.defer(`${mod}.js`);");
Reflect.parse("const x = true ? import.defer('a.js') : import.defer('b.js');");
Reflect.parse("async function fn() { await import.defer('module.js'); }");
Reflect.parse("function* gen() { yield import.defer('module.js'); }");
Reflect.parse("const fn = async () => await import.defer('module.js');");
Reflect.parse("switch (x) { case 1: import.defer('module.js'); break; }");
Reflect.parse("{ import.defer('module.js'); }");
Reflect.parse("function fn() { return import.defer('module.js'); }");
Reflect.parse("const mod = import.defer('module.js');");
Reflect.parse("class C { method() { import.defer('module.js'); } }");
Reflect.parse("import.defer('module' + '.js');");
Reflect.parse("import.defer('module.js',);");

assertThrowsInstanceOf(() => Reflect.parse("typeof import.defer"), SyntaxError);
assertThrowsInstanceOf(() => Reflect.parse("new import.defer('module.js')"), SyntaxError);
assertThrowsInstanceOf(() => Reflect.parse("import.defer()"), SyntaxError);
assertThrowsInstanceOf(() => Reflect.parse("import.defer(...['module.js'])"), SyntaxError);
assertThrowsInstanceOf(() => Reflect.parse("import.defer.property"), SyntaxError);
assertThrowsInstanceOf(() => Reflect.parse("import.defer['module.js']"), SyntaxError);
assertThrowsInstanceOf(() => Reflect.parse("function fn() { return import.defer; }"), SyntaxError);
assertThrowsInstanceOf(() => Reflect.parse("void import.defer"), SyntaxError);
assertThrowsInstanceOf(() => Reflect.parse("!import.defer"), SyntaxError);
assertThrowsInstanceOf(() => Reflect.parse("delete import.defer"), SyntaxError);
assertThrowsInstanceOf(() => Reflect.parse("import.defer++"), SyntaxError);
assertThrowsInstanceOf(() => Reflect.parse("import.defer = 'value'"), SyntaxError);
assertThrowsInstanceOf(() => Reflect.parse("import.defer.foo()"), SyntaxError);
assertThrowsInstanceOf(() => Reflect.parse("import.defer`template`"), SyntaxError);
