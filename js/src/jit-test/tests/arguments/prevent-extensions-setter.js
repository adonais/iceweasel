// MappedArgSetter/UnmappedArgSetter correctly handle arguments objects which
// are non-extensible.

function makeMappedArgs(a, b) {
  return Object.preventExtensions(arguments);
}

function makeUnmappedArgs(a, b) {
  "use strict";
  return Object.preventExtensions(arguments);
}

// Set "length" property on mapped arguments object.
{
  let args = makeMappedArgs(1, 2);
  args.length = 5;
  assertEq(args.length, 5);
  assertEq(Object.hasOwn(args, "length"), true);
}
{
  let args = makeMappedArgs(1, 2);
  assertEq(Reflect.set(args, "length", 5), true);
  assertEq(args.length, 5);
  assertEq(Object.hasOwn(args, "length"), true);
}

// Set "callee" property on mapped arguments object.
{
  let args = makeMappedArgs(1, 2);
  args.callee = null;
  assertEq(args.callee, null);
  assertEq(Object.hasOwn(args, "callee"), true);
}
{
  let args = makeMappedArgs(1, 2);
  assertEq(Reflect.set(args, "callee", null), true);
  assertEq(args.callee, null);
  assertEq(Object.hasOwn(args, "callee"), true);
}

// Set element on mapped arguments object.
{
  let args = makeMappedArgs(1, 2);
  args[0] = 123;
  assertEq(args[0], 123);
  assertEq(Object.hasOwn(args, "0"), true);
}
{
  let args = makeMappedArgs(1, 2);
  assertEq(Reflect.set(args, "0", 123), true);
  assertEq(args[0], 123);
  assertEq(Object.hasOwn(args, "0"), true);
}

// Set "length" property on unmapped arguments object.
{
  let args = makeUnmappedArgs(1, 2);
  args.length = 5;
  assertEq(args.length, 5);
  assertEq(Object.hasOwn(args, "length"), true);
}
{
  let args = makeUnmappedArgs(1, 2);
  assertEq(Reflect.set(args, "length", 5), true);
  assertEq(args.length, 5);
  assertEq(Object.hasOwn(args, "length"), true);
}

// Set element on unmapped arguments object.
{
  let args = makeUnmappedArgs(1, 2);
  args[0] = 123;
  assertEq(args[0], 123);
  assertEq(Object.hasOwn(args, "0"), true);
}
{
  let args = makeUnmappedArgs(1, 2);
  assertEq(Reflect.set(args, "0", 123), true);
  assertEq(args[0], 123);
  assertEq(Object.hasOwn(args, "0"), true);
}

