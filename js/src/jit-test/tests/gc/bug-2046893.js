const {object, transplant} = transplantableObject();
const wr = new WeakRef(object);

// Hop 1: move the identity into a new compartment. origobj becomes a CCW;
// the WeakRef registration is correctly relocated to the new identity.
transplant(newGlobal({ newCompartment: true }));

// Hop 2: transplant again. JS_TransplantObject finds the CCW left behind by
// hop 1 and remaps it: RemapWrapper -> NukeCrossCompartmentWrapper ->
// clearWeakRefTargets(), emptying our WeakRef although its target lives on.
transplant(newGlobal({ newCompartment: true }));

// The target is strongly held and fully functional.
object.x = 42;
assertEq(object.x, 42);

// ES WeakRef liveness invariant: deref() must return the live target.
assertEq(wr.deref() !== undefined, true);
