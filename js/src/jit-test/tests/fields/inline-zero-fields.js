// |jit-test| --setpref=experimental.inline_simple_field_initializers=true

class Lazy {
  constructor() { this.zeta = 1; }
  alphaField = 0;
  bravoField = 0;
}
assertEq(JSON.stringify(new Lazy()), '{"alphaField":0,"bravoField":0,"zeta":1}');

class Default { alphaField = 0; bravoField = 0; }
assertEq(JSON.stringify(new Default()), '{"alphaField":0,"bravoField":0}');

class Derived extends Default { charlieField = 0; }
assertEq(JSON.stringify(new Derived()),
         '{"alphaField":0,"bravoField":0,"charlieField":0}');

class ArrowSuper extends Default {
  charlieField = 0;
  constructor() { const f = () => super(); f(); }
}
assertEq(JSON.stringify(new ArrowSuper()),
         '{"alphaField":0,"bravoField":0,"charlieField":0}');

class Private { x = 0; #y = 0; get y() { return this.#y; } }
assertEq(new Private().y, 0);

// Private names that nothing else in the class reads.
class PrivateUnused { alphaField = 0; #bravo = 0; #charlie = 0; }
assertEq(JSON.stringify(new PrivateUnused()), '{"alphaField":0}');

class PrivateOnly {
  #alpha = 0;
  #bravo = 0;
  static has(o) { return #alpha in o && #bravo in o; }
  constructor() { this.z = 1; }
}
assertEq(PrivateOnly.has(new PrivateOnly()), true);
assertEq(PrivateOnly.has({}), false);

class PrivateDefault { #alpha = 0; static has(o) { return #alpha in o; } }
assertEq(PrivateDefault.has(new PrivateDefault()), true);

// A class with a private method has a private brand and isn't inlined.
class PrivateMethod { #alpha = 0; #m() { return 1; } get v() { return this.#m() + this.#alpha; } }
assertEq(new PrivateMethod().v, 1);

var key = "computed";
class Computed { alpha = 0; [key] = 0; }
assertEq(JSON.stringify(new Computed()), '{"alpha":0,"computed":0}');

class Index { 1 = 0; alpha = 0; }
assertEq(JSON.stringify(new Index()), '{"1":0,"alpha":0}');

class Many { a0=0;a1=0;a2=0;a3=0;a4=0;a5=0;a6=0;a7=0;a8=0;a9=0; }
assertEq(Object.keys(new Many()).length, 10);

// The functions and the class constructors are compiled lazily, then
// delazified when called.
let g = newGlobal({newCompartment: true});
g.evaluate(`
    function makePublic() {
        class C { alphaField = 0; bravoField = 0; }
        return new C();
    }
    function makePrivate() {
        class C { #alpha = 0; #bravo = 0; static has(o) { return #bravo in o; } }
        return C.has(new C());
    }
    function makeExplicit() {
        class C {
            constructor() { this.zeta = 1; }
            alphaField = 0;
            bravoField = 0;
        }
        return new C();
    }
`);

function checkDelazified() {
  assertEq(JSON.stringify(g.makePublic()), '{"alphaField":0,"bravoField":0}');
  assertEq(g.makePrivate(), true);
  assertEq(JSON.stringify(g.makeExplicit()),
           '{"alphaField":0,"bravoField":0,"zeta":1}');
}

checkDelazified();
finishgc();
startgc(0, 'shrinking');
checkDelazified();
