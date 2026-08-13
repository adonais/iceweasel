function no_conflict() {
  return arguments.length;
}
assertEq(no_conflict(1, 2, 3), 3);

function conflict_func() {
  function arguments(a) {}
  return arguments.length;
}
assertEq(conflict_func(1, 2, 3), 1);

function conflict_gen() {
  function* arguments(a) {}
  return arguments.length;
}
assertEq(conflict_gen(1, 2, 3), 1);

function conflict_async() {
  async function arguments(a) {}
  return arguments.length;
}
assertEq(conflict_async(1, 2, 3), 1);

function conflict_async_gen() {
  async function* arguments(a) {}
  return arguments.length;
}
assertEq(conflict_async_gen(1, 2, 3), 1);

function conflict_var() {
  var arguments = [0];
  return arguments.length;
}
assertEq(conflict_var(1, 2, 3), 1);

function conflict_let() {
  let arguments = [0];
  return arguments.length;
}
assertEq(conflict_let(1, 2, 3), 1);

function conflict_const() {
  const arguments = [0];
  return arguments.length;
}
assertEq(conflict_const(1, 2, 3), 1);

function conflict_block_func() {
  {
    function arguments(a) {}
  }
  return arguments.length;
}
assertEq(conflict_block_func(1, 2, 3), 1);

function conflict_block_func_and_let() {
  {
    function arguments(a) {}
  }
  let arguments = [0, 0];
  return arguments.length;
}
assertEq(conflict_block_func_and_let(1, 2, 3), 2);

// A property access chained off |arguments.length| must still read the real
// arguments length, not an enclosing |arguments| binding. The optimization
// elides the local |arguments| binding, so a mis-emitted chain would resolve
// the bare |arguments| name to the enclosing lexical below.
function chain_off_length() {
  let arguments = { length: { secret: "LEAK-FROM-ENCLOSING" } };
  function inner(a, b, c) {
    return arguments.length.secret;
  }
  return inner(1, 2, 3);
}
assertEq(chain_off_length(), undefined);

// Deeper chain: (3).constructor is Number, whose name is "Number".
function chain_off_length_deep() {
  let arguments = { length: { constructor: { name: "LEAK" } } };
  function inner(a, b, c) {
    return arguments.length.constructor.name;
  }
  return inner(1, 2, 3);
}
assertEq(chain_off_length_deep(), "Number");

// The chained form still tracks the actual argument count.
function chain_off_length_count() {
  return arguments.length.toString();
}
assertEq(chain_off_length_count(1, 2, 3, 4, 5), "5");

// The optimization also gives way to a genuine local |arguments| binding under
// a chained access.
function chain_conflict_let() {
  let arguments = { length: { secret: "local" } };
  return arguments.length.secret;
}
assertEq(chain_conflict_let(1, 2, 3), "local");
