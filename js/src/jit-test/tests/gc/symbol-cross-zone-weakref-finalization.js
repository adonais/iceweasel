// |jit-test| --enable-symbols-as-weakmap-keys

// Check that unique symbols from other zones work as WeakRef and
// FinalizationRegistry targets, and that they keep their identity when read
// back out.

gczeal(0);

let g = newGlobal({newCompartment: true});
let heldValues = [];
g.heldValues = heldValues;

function collect() {
  clearKeptObjects();
  gc();
  drainJobQueue();
}

function takeHeldValues() {
  let values = heldValues.slice().sort();
  heldValues.length = 0;
  return values;
}

// WeakRef created in this zone, target symbol created in another zone.
{
  g.eval('var sym = Symbol("target");');
  let ref = new WeakRef(g.sym);
  assertEq(ref.deref(), g.sym);
  assertEq(ref.deref() === g.eval('sym'), true);
  assertEq(ref.deref().description, "target");

  collect();
  assertEq(ref.deref(), g.sym);

  // Only the other zone's reference remains, so the target stays alive.
  collect();
  assertEq(ref.deref() === g.eval('sym'), true);

  g.eval('sym = undefined;');
  collect();
  assertEq(ref.deref(), undefined);
}

// WeakRef created in another zone, target symbol created in this zone.
{
  let mine = Symbol("mine");
  let ref = new g.WeakRef(mine);
  assertEq(ref.deref(), mine);
  assertEq(ref.deref() === mine, true);

  collect();
  assertEq(ref.deref(), mine);

  mine = undefined;
  collect();
  assertEq(ref.deref(), undefined);
}

// WeakRef with no strong reference to the symbol from any zone.
{
  let ref = new WeakRef(g.eval('Symbol("temporary")'));
  collect();
  assertEq(ref.deref(), undefined);
}

// The same symbol held by weak refs in two zones.
{
  g.eval('var shared = Symbol("shared");');
  let ref1 = new WeakRef(g.shared);
  let ref2 = new g.WeakRef(g.shared);
  assertEq(ref1.deref(), ref2.deref());

  collect();
  assertEq(ref1.deref(), g.shared);
  assertEq(ref2.deref(), g.shared);

  g.eval('shared = undefined;');
  collect();
  assertEq(ref1.deref(), undefined);
  assertEq(ref2.deref(), undefined);
}

// WeakRef survives collecting only the zone of the ref while the symbol is held
// by another zone.
{
  g.eval('var held = Symbol("held");');
  let ref = new WeakRef(g.held);
  clearKeptObjects();
  schedulezone(this);
  gc('zone');
  assertEq(ref.deref(), g.held);

  g.eval('held = undefined;');
  collect();
  assertEq(ref.deref(), undefined);
}

// FinalizationRegistry in this zone, symbol target from another zone.
{
  let registry = new FinalizationRegistry(v => heldValues.push(v));

  g.eval('var target = Symbol("registered-target");');
  registry.register(g.target, 'a');
  registry.register(g.eval('Symbol("temporary")'), 'b');

  collect();
  assertEq(takeHeldValues().join(), 'b');

  g.eval('target = undefined;');
  collect();
  assertEq(takeHeldValues().join(), 'a');
}

// FinalizationRegistry in another zone, symbol target from this zone.
{
  let registry = g.eval(
    'new FinalizationRegistry(v => heldValues.push(v))');

  let target = Symbol("local-target");
  registry.register(target, 'c');
  registry.register(Symbol("temporary"), 'd');

  collect();
  assertEq(takeHeldValues().join(), 'd');

  target = undefined;
  collect();
  assertEq(takeHeldValues().join(), 'c');
}

// Symbol unregister tokens passed across zones.
{
  let registry = new FinalizationRegistry(v => heldValues.push(v));

  g.eval('var token = Symbol("token");');
  registry.register({}, 'e', g.token);
  registry.register({}, 'f', g.token);
  registry.register({}, 'g');

  assertEq(registry.unregister(g.token), true);
  assertEq(registry.unregister(g.eval('token')), false);

  collect();
  assertEq(takeHeldValues().join(), 'g');

  let ownToken = Symbol("own-token");
  g.ownToken = ownToken;
  registry.register({}, 'h', ownToken);
  assertEq(registry.unregister(g.ownToken), true);
  collect();
  assertEq(takeHeldValues().join(), '');
}

// Registry in another zone with unregister tokens from this zone.
{
  let registry = g.eval(
    'new FinalizationRegistry(v => heldValues.push(v))');
  let token = Symbol("token");

  registry.register({}, 'i', token);
  registry.register({}, 'j', token);
  assertEq(registry.unregister(token), true);
  assertEq(registry.unregister(token), false);

  collect();
  assertEq(takeHeldValues().join(), '');
}
