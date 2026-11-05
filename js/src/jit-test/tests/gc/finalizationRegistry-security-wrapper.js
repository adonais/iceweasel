// FinalizationRegistry.prototype.register and the WeakRef constructor must
// throw if the target is a wrapper that can't be unwrapped.

load(libdir + "asserts.js");

var g = newGlobal({newCompartment: true, securityWrappers: true});
var target = {};
var fr = new g.FinalizationRegistry(() => {});
assertErrorMessage(() => fr.register(target, 1), g.Error,
                   "Permission denied to access object");
assertErrorMessage(() => new g.WeakRef(target), g.Error,
                   "Permission denied to access object");
