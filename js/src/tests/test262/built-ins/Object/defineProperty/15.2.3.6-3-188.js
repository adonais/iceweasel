// Copyright (c) 2012 Ecma International.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
es5id: 15.2.3.6-3-188
description: >
    Object.defineProperty - 'writable' property in 'Attributes' is an
    empty string  (8.10.5 step 6.b)
includes: [propertyHelper.js]
---*/

var obj = {};

Object.defineProperty(obj, "property", {
  writable: ""
});

verifyProperty(obj, "property", {
  writable: false,
});

reportCompare(0, 0);
