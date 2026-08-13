// Add Uint8Array[Symbol.species] to return Float64Array arrays from slice().
newGlobal().evaluate(`
  Object.defineProperty(Uint8Array, Symbol.species, {
    get() { return Float64Array; }
  });

  let result = new Uint8Array([1, 2, 3]).slice(0, 2);
  assertEq(result.constructor, Float64Array);
  assertEq(result instanceof Float64Array, true);
`);

// Change prototype of Uint8Array to return Float64Array arrays from slice().
newGlobal().evaluate(`
  Uint8Array.prototype.slice = Int8Array.prototype.slice;

  Object.setPrototypeOf(Uint8Array, {
    [Symbol.species]: Float64Array,
  });

  let result = new Uint8Array([1, 2, 3]).slice(0, 2);
  assertEq(result.constructor, Float64Array);
  assertEq(result instanceof Float64Array, true);
`);
