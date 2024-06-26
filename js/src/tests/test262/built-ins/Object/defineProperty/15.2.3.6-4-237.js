// Copyright (c) 2012 Ecma International.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
es5id: 15.2.3.6-4-237
description: >
    Object.defineProperty - 'O' is an Array, 'name' is an array index
    property, the [[Configurable]] field of 'desc' and the
    [[Configurable]] attribute value of 'name' are two booleans with
    different values (15.4.5.1 step 4.c)
includes: [propertyHelper.js]
---*/

var arrObj = [];

Object.defineProperty(arrObj, "0", {
  configurable: true
});

Object.defineProperty(arrObj, "0", {
  configurable: false
});

verifyProperty(arrObj, "0", {
  value: undefined,
  writable: false,
  enumerable: false,
  configurable: false,
});

reportCompare(0, 0);
