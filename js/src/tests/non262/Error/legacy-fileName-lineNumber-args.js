/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The non-standard fileName and lineNumber arguments are only used if they are
// a string, number, boolean, null or undefined. Other values are ignored
// without being converted.

const constructors = [
  Error,
  EvalError,
  RangeError,
  ReferenceError,
  SyntaxError,
  TypeError,
  URIError,
  InternalError,
  AggregateError,
  SuppressedError,
];

let conversions = 0;
const convertible = {
  [Symbol.toPrimitive]() {
    conversions++;
    return 1;
  },
};

const ignoredValues = [Symbol(), 10n, {}, [], () => {}, convertible];

function createError(constructor, ...args) {
  let leadingArgs = [];
  if (constructor === AggregateError) {
    leadingArgs = [[]];
  } else if (constructor === SuppressedError) {
    leadingArgs = [undefined, undefined];
  }
  return new constructor(...leadingArgs, ...args);
}

// Without fileName and lineNumber arguments, errors get the location of the
// `new` expression in createError.
const defaultLocation = createError(Error);

for (const constructor of constructors) {
  for (const value of ignoredValues) {
    // Ignored as fileName.
    let error = createError(constructor, "message", value);
    assertEq(error.fileName, defaultLocation.fileName);
    assertEq(error.lineNumber, defaultLocation.lineNumber);

    // Ignored as lineNumber.
    error = createError(constructor, "message", "file.js", value);
    assertEq(error.fileName, "file.js");
    assertEq(error.lineNumber, defaultLocation.lineNumber);
  }

  // Used as fileName.
  for (const value of ["file.js", 123, true, null, undefined]) {
    const error = createError(constructor, "message", value);
    assertEq(error.fileName, String(value));
  }

  // Used as lineNumber.
  const lineNumbers = [
    ["42", 42],
    [42, 42],
    [true, 1],
    [null, 0],
    [undefined, 0],
  ];
  for (const [value, expected] of lineNumbers) {
    const error = createError(constructor, "message", "file.js", value);
    assertEq(error.lineNumber, expected);
  }
}

assertEq(conversions, 0);

if (typeof reportCompare === "function") {
  reportCompare(0, 0);
}
