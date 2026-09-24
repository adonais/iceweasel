// |jit-test| --setpref=objectfuse_for_all_protos=false

disableDictionaryModeTeleportation();

// Warm up this script.
for (var i = 0; i < 2000; i++) {}

// Holder with >= 4 fixed slots so the property lands in a fixed slot.
var holder = { f0: 0, f1: 0, f2: 0, f3: 0 };
delete holder.f3;
delete holder.f2;
delete holder.f1;
delete holder.f0;
holder.p0 = 0;
holder[null] = 1;
var o = holder;
for (var i = 0; i < 16; i++) {
  o = Object.create(o);
}
var L = o;

var home = {
  m(k) {
    return super[k];
  }
};
Object.setPrototypeOf(home, L);

// Shadow holder[null] from a prototype object to set InvalidatedTeleporting.
L[null] = 1;
delete L[null];
assertEq(hasInvalidatedTeleporting(holder), true);

// Attach a stub guarding holder's first shape (property in slot 1).
for (var i = 0; i < 60; i++) {
  home.m(null);
}

// Move the property to slot 2 and attach a second stub.
delete holder[null];
delete holder.p0;
holder.p0 = 0;
holder.z = 1;
holder[null] = 2;
home.m(null);

// Revert holder to the first shape so both stubs have entered-count > 0.
delete holder[null];
delete holder.z;
delete holder.p0;
holder.p0 = 0;
holder[null] = 3;
home.m(null);

// Trigger Ion compilation.
for (var i = 0; i < 3000; i++) {
  home.m(null);
}
