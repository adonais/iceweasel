// A nursery AtomRef is promoted by forwarding to its atom, not by allocating
// another string cell.

// The main tests run both with and without the semispace nursery. With
// semispaces, a first-generation nursery string would normally be copied to
// the second generation on the next minor GC, so an AtomRef leaving the
// nursery after a single collection shows it was forwarded to its atom even
// without stringRepresentation(). It also tests the interaction of the AtomRef
// fast path with semispace generations directly.

gczeal(0);

var isDebugBuild = getBuildConfiguration("debug");
var hasStringRepresentation = typeof stringRepresentation === "function";
var semispaceEnabled;

// Non-inline (JSFatInlineString::MAX_LENGTH_LATIN1 is 24), but shorter than
// StringToAtomCache::MinStringLength (39). This keeps the direct tests
// independent of the existing StringToAtomCache minor-GC deduplication path.
var directText = "abcdefghijklmnopqrstuvwxyz";

// Long enough that a substring can remain a dependent string.
var dependentText =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

// Non-Latin1 and non-inline in TwoByte form, while still shorter than
// StringToAtomCache::MinStringLength.
var twoByteText = "Ābcdefghijklmnopqrstuvwxyz";

function representation(s) {
  if (!hasStringRepresentation) {
    return null;
  }
  return JSON.parse(stringRepresentation(s));
}

// Deliberately use Object.defineProperty instead of `obj[s] = 1`.  SetElem
// JIT paths can use StringToAtomCache::lastLookups_ / tryFastAtomize to obtain
// the canonical atom without mutating the input JSString.  That is fine for
// normal property access, but it would make this test silently fail to create
// the AtomRef state it is supposed to exercise.  Object.defineProperty reaches
// the native DefineProperty intrinsic, whose PrimitiveValueToId<CanGC> call
// invokes AtomizeString on this exact JSString.  For an eligible string this
// therefore runs tryReplaceWithAtomRef() deterministically.
function atomize(s) {
  var obj = {};
  Object.defineProperty(obj, s, { value: 1, enumerable: true });
  return Object.keys(obj)[0];
}

// ArrayBuffers are never nursery allocated, so this is a tenured object
// whose slot writes go through the store buffer.
function makeTenuredSlotHolder() {
  var holder = new ArrayBuffer(1);
  holder.name = null;
  assertEq(isNurseryAllocated(holder), false);
  return holder;
}

function assertAtomRef(s, atom) {
  var rep = representation(s);
  if (rep) {
    var atomRep = representation(atom);
    assertEq(rep.flags.includes("ATOM_REF_BIT"), true);
    assertEq(rep.flags.includes("ATOM_BIT"), false);
    assertEq(rep.flags.includes("DEPENDENT_BIT"), true);
    assertEq(rep.flags.includes("HAS_STRING_BUFFER_BIT"), false);
    assertEq(rep.base.address, atomRep.address);
  }
}

function assertForwardedToAtom(s, atom) {
  assertEq(isNurseryAllocated(s), false);
  var rep = representation(s);
  if (rep) {
    var atomRep = representation(atom);
    assertEq(rep.flags.includes("ATOM_BIT"), true);
    assertEq(rep.flags.includes("ATOM_REF_BIT"), false);
    assertEq(rep.address, atomRep.address);
  }
}

// Test the basic state this optimization is intended to handle: a live,
// first-generation nursery string is converted in place to an AtomRef and is
// then encountered by the next minor GC.
//
// How this state can occur:
//   1. Ordinary string-producing code allocates a non-inline string in the
//      nursery.
//   2. While that same JSString is still live, an operation that needs an atom
//      (for example property-key/name atomization) interns its characters.
//   3. AtomizeStringSlow can call tryReplaceWithAtomRef(), replacing the
//      nursery string in place with a dependent AtomRef whose base is the
//      canonical, always-tenured atom.
//   4. The original string remains reachable until the next minor GC.
//
// The AtomRef fast path must install a relocation overlay that forwards
// directly to the canonical atom. With the semispace nursery enabled, an
// ordinary string allocated after the last minor GC would instead be copied to
// the second generation, so isNurseryAllocated(s) becoming false after one
// collection is a discriminating oracle even without stringRepresentation().
function directAtomRef() {
  var s = newString(directText, { tenured: false });
  assertEq(isNurseryAllocated(s), true);
  var before = representation(s);
  if (before) {
    assertEq(before.flags.includes("EXTENSIBLE"), false);
    assertEq(before.flags.includes("HAS_STRING_BUFFER_BIT"), false);
    assertEq(before.charsInNursery, true);
  }

  var atom = atomize(s);
  assertAtomRef(s, atom);

  minorgc();

  assertEq(s, directText);
  assertForwardedToAtom(s, atom);
}

// Test the age boundary: the string first survives one semispace collection,
// then becomes an AtomRef while already resident in the second nursery
// generation, and is collected again when it is old enough to tenure.
//
// How this state can occur:
//   1. A normal string is created and remains live across a minor GC without
//      yet being used as an atom/property name.
//   2. Later, before the next minor GC, code performs an atomizing operation on
//      that same string and tryReplaceWithAtomRef() mutates the old nursery
//      cell into an AtomRef.
//   3. The following collection sees an AtomRef whose allocation age would
//      normally cause shouldTenure() to move it to the tenured heap.
//
// Before this optimization, that path could allocate/copy a new tenured string
// cell that retained the AtomRef representation. With the optimization, no
// replacement string cell should be
// allocated: the old nursery cell must forward to the already-tenured atom.
// Both implementations finish outside the nursery, so nursery membership alone
// cannot distinguish them. We therefore require stringRepresentation here and
// verify that the final address is the atom's address, not the old AtomRef
// address. Skipping the case without that hook is preferable to a test that
// would pass while exercising the old behavior.
function secondGenerationAtomRef() {
  // There is no second nursery generation without semispaces.
  if (!semispaceEnabled || !hasStringRepresentation) {
    return;
  }

  var s = newString(directText, { tenured: false });
  assertEq(isNurseryAllocated(s), true);

  minorgc();
  assertEq(isNurseryAllocated(s), true);

  var atom = atomize(s);
  assertAtomRef(s, atom);
  var atomRefAddress = representation(s).address;
  assertEq(atomRefAddress == representation(atom).address, false);

  minorgc();

  assertEq(s, directText);
  assertForwardedToAtom(s, atom);
  assertEq(representation(s).address == atomRefAddress, false);
}

// What this tests:
//   A Latin1 dependent string whose immediate base is a nursery AtomRef, with
//   tracing ordered so the AtomRef has already been forwarded to its atom when
//   the dependent is processed. This specifically exercises recovery through
//   StringRelocationOverlay and the Latin1 dependent-base relocation path.
//
// How this state can occur:
//   This exact AtomRef-as-intermediate-base shape is intentionally adversarial.
//   Normal NewDependentString contracts dependent base chains, so creating a
//   substring from an AtomRef normally makes the canonical atom the base. The
//   reverse order is also blocked: once another string depends on a string,
//   DEPENDED_ON_BIT makes tryReplaceWithAtomRef() refuse to replace that base.
//   The testing function's 'suppress-contraction' option is therefore used to
//   construct the state explicitly. Rope flattening can create dependent chains
//   in practice, though the problematic scenario may not actually be possible.
//
// How the ordering is forced:
//   |s| is stored in a pre-existing slot of a definitely-tenured NativeObject.
//   HeapSlot's post barrier creates StoreBuffer::SlotsEdge, and slot edges are
//   traced before the stack/runtime roots that keep |d| alive. Minor GC thus
//   replaces |s| with an overlay forwarding to |atom| first; later, relocating
//   |d| must recover its base and character offset through that overlay.
//
// Check that |d| remains dependent but with its base updated to the canonical
// atom.
function dependentOnAtomRef() {
  var holder = makeTenuredSlotHolder();
  var s = newString(dependentText, { tenured: false });
  assertEq(isNurseryAllocated(s), true);
  var atom = atomize(s);
  assertAtomRef(s, atom);
  var d = newDependentString(s, 2, 40,
                             { tenured: false, 'suppress-contraction': true });
  var dRep = representation(d);
  if (dRep) {
    var sRep = representation(s);
    assertEq(dRep.flags.includes("DEPENDENT_BIT"), true);
    assertEq(dRep.flags.includes("LATIN1_CHARS_BIT"), true);
    assertEq(dRep.base.address, sRep.address);
    assertEq(sRep.flags.includes("DEPENDED_ON_BIT"), true);
  }

  holder.name = s;
  minorgc();

  assertEq(d, dependentText.substring(2, 40));
  assertEq(s, dependentText);
  assertForwardedToAtom(s, atom);
  var afterD = representation(d);
  if (afterD) {
    assertEq(afterD.flags.includes("DEPENDENT_BIT"), true);
    assertEq(afterD.base.address, representation(atom).address);
  }
}

function dependentOnTwoByteAtomRef() {
  var holder = makeTenuredSlotHolder();
  var s = newString(twoByteText, { tenured: false, twoByte: true });
  assertEq(isNurseryAllocated(s), true);
  var atom = atomize(s);
  assertAtomRef(s, atom);
  // [2, 20) has length 18, longer than the TwoByte inline maximum (12).
  var d = newDependentString(s, 2, 20,
                             { tenured: false, 'suppress-contraction': true });
  var dRep = representation(d);
  if (dRep) {
    var sRep = representation(s);
    var atomRep = representation(atom);
    assertEq(dRep.flags.includes("DEPENDENT_BIT"), true);
    assertEq(dRep.flags.includes("LATIN1_CHARS_BIT"), false);
    assertEq(sRep.flags.includes("LATIN1_CHARS_BIT"), false);
    assertEq(atomRep.flags.includes("LATIN1_CHARS_BIT"), false);
    assertEq(dRep.base.address, sRep.address);
    assertEq(sRep.flags.includes("DEPENDED_ON_BIT"), true);
  }

  holder.name = s;
  minorgc();

  assertEq(d, twoByteText.substring(2, 20));
  assertEq(s, twoByteText);
  assertForwardedToAtom(s, atom);
  var afterD = representation(d);
  if (afterD) {
    assertEq(afterD.flags.includes("DEPENDENT_BIT"), true);
    assertEq(afterD.flags.includes("LATIN1_CHARS_BIT"), false);
    assertEq(afterD.base.address, representation(atom).address);
  }
}

// Test a tenured JSRope that directly owns an edge to a nursery AtomRef. This
// exercises the JSString whole-cell StoreBuffer path rather than the NativeObject
// slot path used by the dependent-string tests.
//
// How this state can occur:
//   1. A younger string is used as one child of a rope whose rope cell is
//      already tenured (or is deliberately allocated tenured).
//   2. The generational barrier records the rope because a tenured string cell
//      now points to a nursery string cell.
//   3. Before the next minor GC, the nursery child is atomized in place and
//      becomes an AtomRef.
//
// During minor GC, StoreBuffer whole-cell tracing calls the JSString-specific
// TraceWholeCell path, traces the rope children, and must rewrite the left-child
// edge from the AtomRef cell to the canonical atom. The representation is
// inspected before doing a string equality operation so the test itself cannot
// flatten the rope and hide a failed edge update. This case therefore checks
// the parent-edge forwarding contract independently of dependent-string fixup.
function wholeCellRootAtomRef() {
  var s = newString(directText, { tenured: false });
  assertEq(isNurseryAllocated(s), true);

  var rope = newRope(s, "!", { nursery: false });
  assertEq(isNurseryAllocated(rope), false);
  var ropeBefore = representation(rope);
  if (ropeBefore) {
    assertEq(ropeBefore.leftChild.address, representation(s).address);
  }

  var atom = atomize(s);
  assertAtomRef(s, atom);

  minorgc();

  var ropeAfter = representation(rope);
  if (ropeAfter) {
    assertEq(ropeAfter.leftChild.address, representation(atom).address);
  }
  assertEq(rope, directText + "!");
  assertForwardedToAtom(s, atom);
}

// Test the raw-malloc character-buffer ownership mode. A nursery JSString can
// own out-of-line characters that live outside the nursery.
//
// How this state can occur:
//   1. A non-inline nursery linear/extensible string receives an out-of-line
//      malloc allocation for its characters/capacity.
//   2. The string is atomized before collection. tryReplaceWithAtomRef() changes
//      the cell to a non-owning AtomRef and changes its chars pointer to the
//      canonical atom's chars while deferring the free of the old malloc
//      allocation.
//   3. The AtomRef then survives to minor GC and is forwarded directly to its
//      atom by the optimization under test.
//
// The capacity option deterministically constructs this otherwise allocator-
// dependent ownership mode. Before atomization we prove the source is
// extensible, not StringBuffer-backed, and has chars outside the nursery. After
// atomization we prove the AtomRef points at different (atom-owned) characters.
// The collection then simultaneously exercises direct AtomRef forwarding and
// cleanup of the now-detached malloced buffer, guarding against leaks, double
// frees, or treating the atom's chars as the nursery-owned allocation.
function mallocedCharsAtomRef() {
  var s = newString(directText, { tenured: false, capacity: 64 });
  assertEq(isNurseryAllocated(s), true);

  var before = representation(s);
  if (before) {
    assertEq(before.flags.includes("EXTENSIBLE"), true);
    assertEq(before.flags.includes("HAS_STRING_BUFFER_BIT"), false);
    assertEq(before.charsInNursery, false);
  }

  var atom = atomize(s);
  assertAtomRef(s, atom);
  var rep = representation(s);
  if (rep) {
    var atomRep = representation(atom);
    assertEq(rep.flags.includes("EXTENSIBLE"), false);
    assertEq(rep.flags.includes("HAS_STRING_BUFFER_BIT"), false);
    assertEq(rep.chars, atomRep.chars);
    assertEq(before.chars == rep.chars, false);
  }

  minorgc();
  finishBackgroundFree();

  assertEq(s, directText);
  assertForwardedToAtom(s, atom);
}

// Test ordinary Nursery::stringBuffers_ bookkeeping when the nursery source
// shares a refcounted mozilla::StringBuffer with a tenured string and is then
// converted to an AtomRef. This is the ownership shape that exposed the original
// backout problem.
//
// How this state can occur:
//   1. SpiderMonkey creates a StringBuffer-backed string. Another string can
//      share that immutable refcounted backing store instead of copying chars.
//   2. One sharer is tenured while another JSString cell is nursery allocated;
//      the nursery records the latter in stringBuffers_ so its buffer reference
//      can be released when that nursery cell disappears.
//   3. The nursery sharer is atomized. tryReplaceWithAtomRef() makes the cell a
//      dependent/non-owning AtomRef and repoints its chars to the canonical
//      atom, but the old StringBuffer reference remains a nursery-sweep
//      responsibility until the next minor GC.
//
// The AtomRef must NOT inherit HAS_STRING_BUFFER_BIT: that flag means the
// JSString itself owns the buffer represented by its current chars pointer. We
// verify the tenured owner still sees refcount 2 before collection, then after
// the AtomRef forwards to the atom and background release finishes the old
// buffer must have refcount 1. This catches both missed releases and accidental
// double releases while also checking canonical AtomRef forwarding.
function stringBufferAtomRef() {
  var owner = newString(directText,
                        { newStringBuffer: true, tenured: true });
  var s = newString(owner, { shareStringBuffer: true, tenured: false });
  assertEq(isNurseryAllocated(s), true);

  var ownerRep = representation(owner);
  if (ownerRep) {
    assertEq(ownerRep.flags.includes("HAS_STRING_BUFFER_BIT"), true);
    if (isDebugBuild) {
      assertEq(ownerRep.bufferRefCount, 2);
    }
  }

  var atom = atomize(s);
  assertAtomRef(s, atom);

  var rep = representation(s);
  if (rep) {
    var atomRep = representation(atom);
    ownerRep = representation(owner);
    assertEq(rep.flags.includes("HAS_STRING_BUFFER_BIT"), false);
    assertEq(atomRep.flags.includes("HAS_STRING_BUFFER_BIT"), false);
    assertEq(rep.chars, atomRep.chars);
    assertEq(ownerRep.chars == rep.chars, false);
    // Nursery AtomRef conversion leaves release of the old buffer to sweep.
    if (isDebugBuild) {
      assertEq(ownerRep.bufferRefCount, 2);
    }
  }

  minorgc();
  finishBackgroundFree();

  assertForwardedToAtom(s, atom);
  ownerRep = representation(owner);
  if (ownerRep && isDebugBuild) {
    assertEq(ownerRep.bufferRefCount, 1);
  }
}

// Test the second StringBuffer bookkeeping family:
// Nursery::extensibleStringBuffers_. Large rope flattening can turn the nursery
// rope root into an extensible linear string backed by a StringBuffer, and that
// buffer is tracked differently from an ordinary StringBuffer-backed linear
// string.
//
// How this state can occur:
//   1. Concatenation builds a nursery rope from large string pieces.
//   2. A consumer requiring contiguous characters forces rope flattening.
//      Flattening mutates the rope root into an extensible linear string and
//      can attach a refcounted buffer that the nursery records in
//      extensibleStringBuffers_.
//   3. The flattened string is later atomized while still in the nursery. The
//      canonical atom for this large value has its own StringBuffer, while the
//      old extensible source buffer is still awaiting nursery cleanup.
//   4. The AtomRef is then reached by minor GC and forwarded to the atom.
//
// This intentionally creates two distinct StringBuffers at once: |owner| keeps
// the source/flattening buffer alive, while |atom| owns the canonical atom
// buffer. The AtomRef itself must own neither buffer and must point at the
// atom's chars. After sweep, only the source owner's reference to the old buffer
// remains. The test therefore catches registry confusion where GC might release
// the atom's buffer, fail to release the old extensible buffer, or propagate
// StringBuffer ownership bits onto the AtomRef.
function extensibleStringBufferAtomRef() {

  var expected = "a".repeat(300) + "b".repeat(300);
  var left = newString("a".repeat(300), { tenured: false });
  var right = newString("b".repeat(300), { tenured: false });
  var s = newRope(left, right);
  assertEq(isNurseryAllocated(s), true);
  assertEq(isRope(s), true);

  ensureLinearString(s);
  assertEq(isRope(s), false);

  var before = representation(s);
  if (before) {
    assertEq(before.flags.includes("EXTENSIBLE"), true);
    assertEq(before.flags.includes("HAS_STRING_BUFFER_BIT"), true);
  }

  var owner = newString(s, { shareStringBuffer: true, tenured: true });
  var ownerRep = representation(owner);
  if (ownerRep && isDebugBuild) {
    assertEq(ownerRep.bufferRefCount, 2);
  }

  var atom = atomize(s);
  assertAtomRef(s, atom);

  var rep = representation(s);
  if (rep) {
    var atomRep = representation(atom);
    ownerRep = representation(owner);
    assertEq(rep.flags.includes("EXTENSIBLE"), false);
    assertEq(rep.flags.includes("HAS_STRING_BUFFER_BIT"), false);
    assertEq(atomRep.flags.includes("HAS_STRING_BUFFER_BIT"), true);
    if (isDebugBuild) {
      assertEq(atomRep.bufferRefCount, 1);
    }
    assertEq(rep.chars, atomRep.chars);
    assertEq(ownerRep.chars == rep.chars, false);
    if (isDebugBuild) {
      assertEq(ownerRep.bufferRefCount, 2);
    }
  }

  minorgc();
  finishBackgroundFree();

  assertEq(s, expected);
  assertForwardedToAtom(s, atom);
  ownerRep = representation(owner);
  if (ownerRep && isDebugBuild) {
    assertEq(ownerRep.bufferRefCount, 1);
  }
}

// Test the unusual but valid representation where a non-inline AtomRef's chars
// pointer points directly into the inline storage of its canonical atom.
//
// How this state can occur:
//   1. A string is created through a UTF-16/TwoByte-producing path even though
//      every character is representable as Latin1. Its chosen length is just
//      above the ordinary TwoByte inline limit, so the source JSString itself
//      must use out-of-line TwoByte storage.
//   2. Atomization is allowed to deflate those characters to Latin1.
//   3. The Latin1 representation is small enough to fit inside a FatInlineAtom,
//      so the canonical atom stores its characters inside the atom cell.
//   4. tryReplaceWithAtomRef() mutates the original nursery string into a
//      dependent AtomRef and sets its non-inline chars field to point into that
//      inline atom storage.
//
// setNonInlineChars() has an explicit AtomRef+inline-atom exception for exactly
// this shape. The build-configuration limits are queried instead of assuming a
// fixed platform size. The test verifies both the TwoByte-to-Latin1 encoding
// transition and the shared chars address, then makes minor GC forward the
// AtomRef to that inline atom. This guards the relocation overlay against
// assuming an AtomRef's saved chars necessarily refer to separately allocated
// string storage.
function inlineAtomTarget() {
  var length = getBuildConfiguration("inline-two-byte-chars") + 1;
  assertEq(length <= getBuildConfiguration("fat-inline-atom-latin1-chars"),
           true);
  var inlineText = "x".repeat(length);
  var s = newString(inlineText, { tenured: false, twoByte: true });
  assertEq(isNurseryAllocated(s), true);
  var sourceRep = representation(s);
  if (sourceRep) {
    assertEq(sourceRep.flags.includes("INLINE_BIT"), false);
    assertEq(sourceRep.flags.includes("LATIN1_CHARS_BIT"), false);
  }

  var atom = atomize(s);
  assertAtomRef(s, atom);
  var rep = representation(s);
  if (rep) {
    var atomRep = representation(atom);
    assertEq(rep.flags.includes("INLINE_BIT"), false);
    assertEq(rep.flags.includes("LATIN1_CHARS_BIT"), true);
    assertEq(atomRep.flags.includes("INLINE_BIT"), true);
    assertEq(atomRep.flags.includes("LATIN1_CHARS_BIT"), true);
    assertEq(rep.chars, atomRep.chars);
  }

  minorgc();

  assertEq(s, inlineText);
  assertForwardedToAtom(s, atom);
}

// The remaining tests cover edge cases and need stringRepresentation().

function isAtomRef(s) {
  return representation(s).flags.includes("ATOM_REF_BIT");
}
function isAtom(s) {
  return representation(s).flags.includes("ATOM_BIT");
}
function addr(s) {
  return representation(s).address;
}
// A minor GC may already have forwarded |s| to |atom|.
function assertRefOrAtom(s, atom) {
  if (isAtomRef(s)) {
    assertEq(representation(s).base.address, addr(atom));
  } else {
    assertEq(addr(s), addr(atom));
  }
}
function makeAtomRef(s) {
  var atom = atomize(s);
  assertEq(isAtom(atom), true);
  assertRefOrAtom(s, atom);
  return atom;
}
function checkForwarded(s, atom, text) {
  assertEq(s, text);
  assertEq(isAtomRef(s), false);
  assertEq(isAtom(s), true);
  assertEq(addr(s), addr(atom));
}

var LONG = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
var uniq = 0;
// Text that has not been atomized before.
function fresh(prefix) {
  return (prefix || "fresh-atomref-") + (uniq++) + "-" + LONG;
}

function testShapes() {
  var makers = [
    t => newString(t, { tenured: false }),
    // TwoByte storage with Latin1 contents, so the atom is Latin1.
    t => newString(t, { tenured: false, twoByte: true }),
    t => newString("ሴ" + t, { tenured: false, twoByte: true }),
    t => newString(t, { tenured: false, newStringBuffer: true }),
    t => newString(t, { tenured: false, capacity: t.length * 4 }),
    t => ensureLinearString(t.substring(0, 10) + t.substring(10)),
    t => newRope(t.substring(0, 13), t.substring(13), { nursery: true }),
  ];
  for (var make of makers) {
    var s = make(fresh());
    var text = String(s);
    var atom = makeAtomRef(s);
    minorgc();
    checkForwarded(s, atom, text);
    assertEq(addr(atomize(s)), addr(atom));
  }
}

function testInlineAndPermanentAtoms() {
  for (var text of ["abcdefghijklm",              // inline atom
                    "hasOwnProperty",             // permanent atom
                    "propertyIsEnumerable",       // permanent atom
                    "getOwnPropertyDescriptor",   // pinned, non-inline
                    "getOwnPropertyDescriptors",  // permanent, non-inline
                    "x".repeat(13) + uniq++]) {
    var s = newString(text, { tenured: false, twoByte: true });
    var atom = makeAtomRef(s);
    minorgc();
    checkForwarded(s, atom, text);
    var o = { [text]: 42 };
    assertEq(o[s], 42);
  }
}

// Many AtomRefs to one atom, together with an equal plain string and an equal
// string in the StringToAtomCache, all in the same minor GC.
function testManyRefsSameAtom() {
  var text = fresh();
  var atom = atomize(newString(text, { tenured: true }));
  var refs = [];
  for (var i = 0; i < 100; i++) {
    var s = newString(text, { tenured: false, twoByte: !!(i & 1) });
    assertRefOrAtom(s, atomize(s));
    refs.push(s);
  }
  var plain = newString(text, { tenured: false });
  // Depended on, so it goes in the StringToAtomCache instead of becoming an
  // AtomRef.
  var cached = newString(text, { tenured: false });
  var dep = newDependentString(cached, 1, { tenured: false });
  atomize(cached);
  assertEq(isAtomRef(cached), false);
  minorgc();
  for (var s of refs) {
    checkForwarded(s, atom, text);
  }
  assertEq(plain, text);
  assertEq(cached, text);
  assertEq(dep, text.substring(1));
}

// AtomRefs reached through the store buffer from tenured holders.
function testHolders() {
  var obj = {};
  var arr = [];
  var map = new Map();
  var set = new Set();
  var keyMap = new Map();
  minorgc();
  var texts = [];
  var closures = [];
  for (var i = 0; i < 50; i++) {
    var text = fresh();
    texts.push(text);
    let s = newString(text, { tenured: false });
    assertRefOrAtom(s, atomize(s));
    obj["p" + i] = s;
    arr.push(s);
    map.set(i, s);
    set.add(s);
    keyMap.set(s, i);
    closures.push(() => s);
  }
  minorgc();
  for (var i = 0; i < texts.length; i++) {
    var t = texts[i];
    assertEq(obj["p" + i], t);
    assertEq(isAtom(obj["p" + i]), true);
    assertEq(arr[i], t);
    assertEq(map.get(i), t);
    assertEq(set.has(t), true);
    assertEq(set.has(newString(t, { tenured: false })), true);
    assertEq(keyMap.get(t), i);
    assertEq(keyMap.get(newString(t, { twoByte: true })), i);
    assertEq(closures[i](), t);
  }
  gc();
  gc(undefined, "shrinking");
  for (var i = 0; i < texts.length; i++) {
    assertEq(set.has(texts[i]), true);
    assertEq(keyMap.get(texts[i]), i);
  }
}

function testRopeChildren() {
  var text = fresh();
  var s = newString(text, { tenured: false });
  var atom = makeAtomRef(s);

  var nurseryRope = newRope(s, s, { nursery: true });
  var tenuredRope = newRope(s, "-tail-" + LONG, { nursery: false });
  var nested = newRope(newRope(s, s, { nursery: true }),
                       newRope("head-" + LONG, s, { nursery: false }),
                       { nursery: false });
  minorgc();
  checkForwarded(s, atom, text);
  assertEq(nurseryRope, text + text);
  assertEq(tenuredRope, text + "-tail-" + LONG);
  assertEq(nested, text + text + "head-" + LONG + text);

  var flat = ensureLinearString(nested);
  assertEq(flat, text + text + "head-" + LONG + text);
  makeAtomRef(newString(flat, { tenured: false }));
  minorgc();
}

// Dependent strings and chains on an AtomRef base, for each combination of
// dependent heap, trace order and encoding.
function testDependents() {
  for (var depTenured of [false, true]) {
    for (var holderFirst of [false, true]) {
      for (var twoByte of [false, true]) {
        var text = fresh();
        var holder;
        if (holderFirst) {
          // Traced from the store buffer before the stack.
          holder = new WeakRef(Object.create(null));
          minorgc();
        }
        var s = newString(text, { tenured: false, twoByte });
        var atom = makeAtomRef(s);
        if (holder) {
          holder.s = s;
        }
        var d = newDependentString(s, 3, text.length - 2,
                                   { tenured: depTenured,
                                     "suppress-contraction": true });
        var d2 = newDependentString(d, 2, d.length - 1,
                                    { tenured: !depTenured,
                                      "suppress-contraction": true });
        var d3 = newDependentString(s, 1, { tenured: false });
        minorgc();
        checkForwarded(s, atom, text);
        assertEq(d, text.substring(3, text.length - 2));
        assertEq(d2, text.substring(5, text.length - 3));
        assertEq(d3, text.substring(1));
        gc(undefined, "shrinking");
        assertEq(d, text.substring(3, text.length - 2));
        assertEq(d2, text.substring(5, text.length - 3));
        assertEq(d3, text.substring(1));
        assertEq(atomize(d), text.substring(3, text.length - 2));
        assertEq(atomize(d2), text.substring(5, text.length - 3));
      }
    }
  }
}

// StringBuffer refcounts must balance whether the AtomRef dies or is
// forwarded.
function testBuffers() {
  var text = fresh();
  var owner = newString(text, { newStringBuffer: true, tenured: true });
  var keptRefs = [];
  var keptOthers = [];
  var atom;
  for (var i = 0; i < 20; i++) {
    var s = newString(owner, { shareStringBuffer: true, tenured: false });
    atom = atomize(s);
    var wasRef = isAtomRef(s);
    if (i & 1) {
      (wasRef ? keptRefs : keptOthers).push(s);
    }
  }
  var atomSharesBuffer =
    representation(atom).flags.includes("HAS_STRING_BUFFER_BIT") &&
    representation(atom).chars === representation(owner).chars;
  minorgc();
  minorgc();
  finishBackgroundFree();
  for (var s of keptRefs) {
    checkForwarded(s, atom, text);
  }
  for (var s of keptOthers) {
    assertEq(s, text);
  }
  if (isDebugBuild) {
    var count = representation(owner).bufferRefCount;
    assertEq(count <= 1 + (atomSharesBuffer ? 1 : 0) + keptOthers.length, true);
    assertEq(count >= 1, true);
  }
}

function testOtherGlobals() {
  for (var opts of [{}, { newCompartment: true }, { sameZoneAs: this }]) {
    var g = newGlobal(opts);
    g.LONG = LONG;
    g.eval(`
      var text = "other-global-" + LONG;
      var s = newString(text, { tenured: false });
      ({})[s] = 1;
      var wasAtomRef = JSON.parse(stringRepresentation(s)).flags
                           .includes("ATOM_REF_BIT");
      var arr = [s, newRope(s, s, { nursery: true })];
    `);
    minorgc();
    g.eval(`
      if (s !== text || arr[0] !== text || arr[1] !== text + text) {
        throw new Error("bad string after minor GC");
      }
      if (wasAtomRef &&
          !JSON.parse(stringRepresentation(s)).flags.includes("ATOM_BIT")) {
        throw new Error("not forwarded to atom");
      }
    `);
    assertEq(g.s, "other-global-" + LONG);
    gc();
  }
}

function testJit() {
  var o = {};
  function hot(s, i) {
    o[s] = i;
    if (i % 50 === 0) {
      minorgc();
    }
    return o[s] + s.length;
  }
  for (var i = 0; i < 2000; i++) {
    var text = "jit-" + (i % 37) + "-" + LONG;
    var s = newString(text, { tenured: false, twoByte: !!(i & 2) });
    assertEq(hot(s, i), i + text.length);
    assertEq(s, text);
  }
}

function testZeal() {
  var texts = [];
  var strs = [];
  gczeal(7, 1);
  try {
    for (var i = 0; i < 30; i++) {
      var text = fresh("zeal-");
      var s = newString(text, { tenured: false, twoByte: !!(i & 1) });
      atomize(s);
      var r = s + s;
      texts.push(text);
      strs.push(s, r);
    }
  } finally {
    gczeal(0);
  }
  for (var i = 0; i < texts.length; i++) {
    assertEq(strs[2 * i], texts[i]);
    assertEq(strs[2 * i + 1], texts[i] + texts[i]);
  }
}

// The AtomRef is the only thing keeping its atom alive across a major GC.
function testOnlyRef() {
  var holder = [];
  for (var i = 0; i < 10; i++) {
    var text = fresh("only-");
    var s = newString(text, { tenured: false });
    atomize(s);
    holder.push([s, text.length, text.charCodeAt(text.length - 1)]);
  }
  minorgc();
  gc();
  gc(undefined, "shrinking");
  for (var [s, len, last] of holder) {
    assertEq(s.length, len);
    assertEq(s.charCodeAt(len - 1), last);
    assertEq(isAtom(s), true);
    var o = {};
    o[s] = 1;
    assertEq(Object.keys(o)[0], s);
  }
}

function testOOM() {
  oomTest(function () {
    var s = newString("oom-atomref-" + LONG, { tenured: false });
    atomize(s);
    minorgc();
    assertEq(s, "oom-atomref-" + LONG);
  });
}

var oldSemispace = gcparam("semispaceNurseryEnabled");
for (semispaceEnabled of [false, true]) {
  gcparam("semispaceNurseryEnabled", semispaceEnabled ? 1 : 0);
  // Establish a generation boundary: strings allocated after this are in the
  // first nursery generation.
  minorgc();

  directAtomRef();
  secondGenerationAtomRef();
  dependentOnAtomRef();
  dependentOnTwoByteAtomRef();
  wholeCellRootAtomRef();
  mallocedCharsAtomRef();
  stringBufferAtomRef();
  extensibleStringBufferAtomRef();
  inlineAtomTarget();
}
gcparam("semispaceNurseryEnabled", oldSemispace);

if (hasStringRepresentation && nurseryStringsEnabled()) {
  testShapes();
  testInlineAndPermanentAtoms();
  testManyRefsSameAtom();
  testHolders();
  testRopeChildren();
  testDependents();
  testBuffers();
  testOtherGlobals();
  testJit();
  testZeal();
  testOnlyRef();
  if (this.oomTest) {
    testOOM();
  }
}
