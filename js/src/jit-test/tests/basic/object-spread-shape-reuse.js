// Object spread reuses |from|'s Shape or PropMap when the target is empty and
// every property is a plain enumerable data property.

function keys(o) {
  return Object.keys(o).join(",");
}

function makeWide(n) {
  var o = {};
  for (var i = 0; i < n; i++) {
    o["p" + i] = i;
  }
  return o;
}

// More properties than PropMap::Capacity, so |from|'s PropMap is a chain.
for (var n of [1, 7, 8, 9, 16, 17, 40]) {
  var from = makeWide(n);
  var to = {...from};
  assertEq(keys(to), keys(from));
  assertEq(Object.keys(to).length, n);
  for (var i = 0; i < n; i++) {
    assertEq(to["p" + i], i);
  }
  assertEq(Object.getOwnPropertyDescriptor(to, "p0").enumerable, true);
  assertEq(Object.getOwnPropertyDescriptor(to, "p0").writable, true);
  assertEq(Object.getOwnPropertyDescriptor(to, "p0").configurable, true);
}

// The target literal's fixed-slot count is derived from its own syntactic
// property count, so it usually differs from |from|'s. Both must work.
function spreadPlusThree(o) {
  return {...o, x: 1, y: 2, a: 3};
}
var src = {x: 9, y: 9, a: 9, b: 4, c: 5};
for (var i = 0; i < 200; i++) {
  var r = spreadPlusThree(src);
  assertEq(keys(r), "x,y,a,b,c");
  assertEq(r.x, 1);
  assertEq(r.y, 2);
  assertEq(r.a, 3);
  assertEq(r.b, 4);
  assertEq(r.c, 5);
}

// Non-enumerable properties must not be copied and must not be reused.
var withNonEnum = {a: 1};
Object.defineProperty(withNonEnum, "hidden", {value: 2, enumerable: false,
                                              writable: true,
                                              configurable: true});
withNonEnum.b = 3;
var copy = {...withNonEnum};
assertEq(keys(copy), "a,b");
assertEq("hidden" in copy, false);

// Non-writable / non-configurable properties become plain data properties.
var frozenish = {};
Object.defineProperty(frozenish, "ro", {value: 1, enumerable: true,
                                        writable: false, configurable: false});
var thawed = {...frozenish};
var desc = Object.getOwnPropertyDescriptor(thawed, "ro");
assertEq(desc.writable, true);
assertEq(desc.configurable, true);
assertEq(desc.enumerable, true);

// Symbol-keyed properties are copied and do not appear in Object.keys.
var sym = Symbol("s");
var withSym = {a: 1, [sym]: 2, b: 3};
var symCopy = {...withSym};
assertEq(keys(symCopy), "a,b");
assertEq(symCopy[sym], 2);

// An interesting symbol sets an ObjectFlag on |from|'s shape.
var interesting = {a: 1, [Symbol.iterator]: 2, b: 3};
var interestingCopy = {...interesting};
assertEq(keys(interestingCopy), "a,b");
assertEq(interestingCopy[Symbol.iterator], 2);

// An own "__proto__" data property stays an own data property.
var protoProp = {};
Object.defineProperty(protoProp, "__proto__", {value: 1, enumerable: true,
                                               writable: true,
                                               configurable: true});
var protoCopy = {...protoProp};
assertEq(Object.getOwnPropertyDescriptor(protoCopy, "__proto__").value, 1);
assertEq(Object.getPrototypeOf(protoCopy), Object.prototype);

// Accessors on |from| force the slow path.
var withGetter = {a: 1, get g() { return 5; }, b: 2};
var getterCopy = {...withGetter};
assertEq(keys(getterCopy), "a,g,b");
assertEq(getterCopy.g, 5);
assertEq(Object.getOwnPropertyDescriptor(getterCopy, "g").get, undefined);

// Dictionary-mode sources still copy correctly.
var dict = makeWide(12);
delete dict.p3;
var dictCopy = {...dict};
assertEq(dictCopy.p3, undefined);
assertEq(Object.keys(dictCopy).length, 11);

// Rest destructuring with preceding bindings uses the excludedItems path,
// which never reuses shapes.
var {p0, p1, ...rest} = makeWide(10);
assertEq(p0, 0);
assertEq(Object.keys(rest).length, 8);
assertEq(rest.p2, 2);

// The target of a spread must be extensible and independent of |from|.
var indep = makeWide(10);
var indepCopy = {...indep};
indepCopy.p0 = 99;
assertEq(indep.p0, 0);
Object.preventExtensions(indepCopy);
assertEq(Object.isExtensible(indep), true);

// A Date object with reserved slots as |from|.
var dateSrc = new Date(1234567890000);
dateSrc.a = 1;
dateSrc.b = 2;
var dateCopy = {...dateSrc};
assertEq(keys(dateCopy), "a,b");
assertEq(dateCopy.a, 1);
assertEq(dateCopy.b, 2);

// A rest pattern with no preceding bindings passes excludedItems === null, so
// unlike the filtered form above it does reach the shape reuse path.
var {...bareRest} = makeWide(10);
assertEq(Object.keys(bareRest).length, 10);
assertEq(bareRest.p0, 0);
assertEq(bareRest.p9, 9);

// |from|'s ObjectFlags must not reach the copy when they are more than
// HasEnumerable: a non-extensible or used-as-prototype source still produces an
// ordinary extensible copy.
var preventedSrc = {a: 1, b: 2};
Object.preventExtensions(preventedSrc);
var preventedCopy = {...preventedSrc};
assertEq(keys(preventedCopy), "a,b");
preventedCopy.c = 3;
assertEq(preventedCopy.c, 3);

var usedAsProtoSrc = {a: 1, b: 2};
Object.create(usedAsProtoSrc);
var usedAsProtoCopy = {...usedAsProtoSrc};
assertEq(keys(usedAsProtoCopy), "a,b");
usedAsProtoCopy.c = 3;
assertEq(usedAsProtoCopy.c, 3);

// The target can have no own properties while already holding dense elements,
// which the shape reuse must leave alone.
var withIndex = {0: 1, ...{a: 2, b: 3}};
assertEq(keys(withIndex), "0,a,b");
assertEq(withIndex[0], 1);
assertEq(withIndex.a, 2);
assertEq(withIndex.b, 3);

// A same-compartment cross-realm source can only reuse the PropMap, because the
// BaseShape carries the realm. The copy must get this realm's Object.prototype.
var otherRealm = newGlobal({sameCompartmentAs: this});
var crossSrc = otherRealm.eval("({a: 1, b: 2, c: 3})");
for (var i = 0; i < 20; i++) {
  var crossCopy = {...crossSrc};
  assertEq(keys(crossCopy), "a,b,c");
  assertEq(crossCopy.c, 3);
  assertEq(Object.getPrototypeOf(crossCopy), Object.prototype);
}

// Non-plain native sources take the other precondition branch. Arrays and typed
// arrays expose their elements as own enumerable index properties; String
// objects and arguments objects resolve index properties lazily.
var arrCopy = {...[10, 20, 30]};
assertEq(keys(arrCopy), "0,1,2");
assertEq(arrCopy[1], 20);
assertEq(Array.isArray(arrCopy), false);

// An empty array has no dense elements and no enumerate hook, so unlike the
// cases above it runs all the way to the property walk. Its only own property
// is a non-enumerable "length", so nothing is copied.
var emptyArrCopy = {...[]};
assertEq(Object.keys(emptyArrCopy).length, 0);

var taCopy = {...new Uint8Array([7, 8])};
assertEq(keys(taCopy), "0,1");
assertEq(taCopy[0], 7);

var strCopy = {..."hey"};
assertEq(keys(strCopy), "0,1,2");
assertEq(strCopy[2], "y");
assertEq(Object.hasOwn(strCopy, "length"), false);

var boxedStrCopy = {...new String("hi")};
assertEq(keys(boxedStrCopy), "0,1");
assertEq(boxedStrCopy[1], "i");

function argsSpread() {
  return {...arguments};
}
var argsCopy = argsSpread("a", "b");
assertEq(keys(argsCopy), "0,1");
assertEq(argsCopy[1], "b");

// Repeating a shape pair takes the cached path; the result must not differ
// from the first, uncached one.
var repeatSrc = {a: 1, b: 2, c: 3};
var first = {...repeatSrc};
for (var i = 0; i < 100; i++) {
  var again = {...repeatSrc};
  assertEq(keys(again), keys(first));
  assertEq(again.a, 1);
  assertEq(again.b, 2);
  assertEq(again.c, 3);
}

// Alternating shape pairs defeat a one-entry cache. Results must stay correct.
var altA = {q: 1, r: 2};
var altB = {s: 3, t: 4, u: 5};
for (var i = 0; i < 100; i++) {
  var copyA = {...altA};
  var copyB = {...altB};
  assertEq(keys(copyA), "q,r");
  assertEq(keys(copyB), "s,t,u");
  assertEq(copyA.r, 2);
  assertEq(copyB.u, 5);
}

// Spread and Object.assign disagree about an own __proto__ data property:
// spread defines an own property, Object.assign goes through [[Set]] and hits
// the Object.prototype setter. Neither may serve the other a cached shape.
var protoSrc = {};
var protoMarker = {tag: "own"};
Object.defineProperty(protoSrc, "__proto__", {value: protoMarker,
                                              enumerable: true, writable: true,
                                              configurable: true});
protoSrc.after = 1;
for (var i = 0; i < 100; i++) {
  var viaSpread = {...protoSrc};
  assertEq(Object.hasOwn(viaSpread, "__proto__"), true);
  assertEq(Object.getPrototypeOf(viaSpread), Object.prototype);
  assertEq(viaSpread.after, 1);

  var viaAssign = Object.assign({}, protoSrc);
  assertEq(Object.hasOwn(viaAssign, "__proto__"), false);
  assertEq(Object.getPrototypeOf(viaAssign), protoMarker);
  assertEq(viaAssign.after, 1);
}

// Same, for a symbol-keyed property: spread reuses the shape, Object.assign
// falls back. Interleaving them must not let either see the other's shape.
var mixSym = Symbol("mix");
var mixSrc = {m: 1, [mixSym]: 2, n: 3};
for (var i = 0; i < 100; i++) {
  var mixSpread = {...mixSrc};
  assertEq(keys(mixSpread), "m,n");
  assertEq(mixSpread[mixSym], 2);
  assertEq(Reflect.ownKeys(mixSpread).length, 3);

  var mixAssign = Object.assign({}, mixSrc);
  assertEq(keys(mixAssign), "m,n");
  assertEq(mixAssign[mixSym], 2);
  assertEq(Reflect.ownKeys(mixAssign).length, 3);
}

// Interleaving a plain and a non-plain source must not let the shape cache
// serve one for the other. An array with named properties and no dense elements
// is the case that reaches the cache lookup at all.
var namedArr = [];
Object.defineProperty(namedArr, "u", {value: 7, enumerable: true,
                                      writable: true, configurable: true});
Object.defineProperty(namedArr, "v", {value: 8, enumerable: true,
                                      writable: true, configurable: true});
var plainSrc = {u: 1, v: 2};
for (var i = 0; i < 100; i++) {
  var p = {...plainSrc};
  var a = {...namedArr};
  assertEq(keys(p), "u,v");
  assertEq(p.u, 1);
  assertEq(keys(a), "u,v");
  assertEq(a.u, 7);
  assertEq(Array.isArray(a), false);
}

// A |from| whose properties have non-default flags cannot have its Shape or
// PropMap reused.
var nonDefaultSrc = {};
Object.defineProperty(nonDefaultSrc, "a", {value: 1, enumerable: true,
                                           writable: false,
                                           configurable: true});
Object.defineProperty(nonDefaultSrc, "b", {value: 2, enumerable: true,
                                           writable: false,
                                           configurable: true});
for (var i = 0; i < 100; i++) {
  var ndCopy = {...nonDefaultSrc};
  assertEq(keys(ndCopy), "a,b");
  assertEq(ndCopy.a, 1);
  assertEq(ndCopy.b, 2);
  var ndDesc = Object.getOwnPropertyDescriptor(ndCopy, "a");
  assertEq(ndDesc.writable, true);
  assertEq(ndDesc.configurable, true);
  assertEq(ndDesc.enumerable, true);
}

// Same for a frozen source.
var frozenSrc = Object.freeze({a: 1, b: 2, c: 3});
for (var i = 0; i < 100; i++) {
  var frozenCopy = {...frozenSrc};
  assertEq(keys(frozenCopy), "a,b,c");
  assertEq(frozenCopy.c, 3);
  frozenCopy.d = 4;
  assertEq(frozenCopy.d, 4);
  assertEq(Object.getOwnPropertyDescriptor(frozenCopy, "a").writable, true);
}

// A source with a non-enumerable property must not be cached: |target| ends up
// with fewer slots than |from|, so a cached entry would copy the wrong ones.
var hiddenSrc = {a: 1};
Object.defineProperty(hiddenSrc, "hidden", {value: 9, enumerable: false,
                                            writable: true,
                                            configurable: true});
hiddenSrc.b = 2;
for (var i = 0; i < 100; i++) {
  var hiddenCopy = {...hiddenSrc};
  assertEq(keys(hiddenCopy), "a,b");
  assertEq("hidden" in hiddenCopy, false);
  assertEq(hiddenCopy.a, 1);
  assertEq(hiddenCopy.b, 2);
}

// An interesting symbol sets an ObjectFlag on |from|, so its Shape cannot be
// reused either.
var interestingSrc = {a: 1, [Symbol.iterator]: 2, b: 3};
for (var i = 0; i < 100; i++) {
  var interestingCopy = {...interestingSrc};
  assertEq(keys(interestingCopy), "a,b");
  assertEq(interestingCopy[Symbol.iterator], 2);
  assertEq(Reflect.ownKeys(interestingCopy).length, 3);
}
