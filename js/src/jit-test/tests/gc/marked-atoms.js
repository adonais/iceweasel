// Test basics of atom reference tracking and check the isAtomMarked function
// works.

gczeal(0);
let global = newGlobal({newCompartment: true});
global.eval('var x = {}');
gc();

// Unique symbols are not marked using the atom reference bitmap.
let atom = Symbol();
assertEq(isAtomMarked(this, atom), false);
assertEq(isAtomMarked(global, atom), false);
global.x[atom] = 0;
assertEq(isAtomMarked(global, atom), false);

// Symbols created with Symbol.for do use the atom reference bitmap.
let sym = Symbol.for("baz");
assertEq(isAtomMarked(this, sym), true);
assertEq(isAtomMarked(global, sym), false);
global.x[sym] = 0;
assertEq(isAtomMarked(global, sym), true);
