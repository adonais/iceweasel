// |reftest| shell-option(--enable-iterator-chunking) skip-if(!Iterator.prototype.hasOwnProperty('chunks'))

/*---
features: [Iterator.chunks]
---*/

// Invalid parameter types
assertThrowsInstanceOf(() => Iterator.prototype.chunks('1'), RangeError);
assertThrowsInstanceOf(() => Iterator.prototype.chunks(null), RangeError);
assertThrowsInstanceOf(() => Iterator.prototype.chunks(undefined), RangeError);
assertThrowsInstanceOf(() => Iterator.prototype.chunks({}), RangeError);
assertThrowsInstanceOf(() => Iterator.prototype.chunks([]), RangeError);
assertThrowsInstanceOf(() => Iterator.prototype.chunks(true), RangeError);
assertThrowsInstanceOf(() => Iterator.prototype.chunks(Symbol()), RangeError);
assertThrowsInstanceOf(() => Iterator.prototype.chunks(() => {}), RangeError);
assertThrowsInstanceOf(() => Iterator.prototype.chunks(10n), RangeError);
assertThrowsInstanceOf(() => Iterator.prototype.chunks(-10n), RangeError);
assertThrowsInstanceOf(() => Iterator.prototype.chunks(BigInt(10)), RangeError);
assertThrowsInstanceOf(() => Iterator.prototype.chunks(BigInt(-10)), RangeError);

// NaN and Infinity tests
assertThrowsInstanceOf(() => Iterator.prototype.chunks(NaN), RangeError);
assertThrowsInstanceOf(() => Iterator.prototype.chunks(Infinity), RangeError);
assertThrowsInstanceOf(() => Iterator.prototype.chunks(-Infinity), RangeError);

// Out of range values
assertThrowsInstanceOf(() => Iterator.prototype.chunks(0), RangeError);
assertThrowsInstanceOf(() => Iterator.prototype.chunks(3.25), RangeError);
assertThrowsInstanceOf(() => Iterator.prototype.chunks(-1), RangeError);
assertThrowsInstanceOf(() => Iterator.prototype.chunks(2 ** 32), RangeError);
assertThrowsInstanceOf(() => Iterator.prototype.chunks(2 ** 32 + 1), RangeError);

// Verify no side effect happens if you pass a non-number value
var toPrimitiveCalled = false;
var valueOfCalled = false;
var toStringCalled = false;
const testToPrimitiveObj = {
  get [Symbol.toPrimitive]() {
    toPrimitiveCalled = true;
  }
};
const testValueOfObj = {
  get valueOf() {
    valueOfCalled = true;
  }
};
const testToStringObj = {
  get toString() {
    toStringCalled = true;
  }
};
assertThrowsInstanceOf(() =>[1, 2, 3, 4][Symbol.iterator]().chunks(testToPrimitiveObj), RangeError);
assertEq(toPrimitiveCalled, false);
assertThrowsInstanceOf(() =>[1, 2, 3, 4][Symbol.iterator]().chunks(testValueOfObj), RangeError);
assertEq(valueOfCalled, false);
assertThrowsInstanceOf(() =>[1, 2, 3, 4][Symbol.iterator]().chunks(testToStringObj), RangeError);
assertEq(toStringCalled, false);

if (typeof reportCompare === 'function')
    reportCompare(0, 0);
