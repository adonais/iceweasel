// Copyright (c) 2012 Ecma International.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
es5id: 15.2.3.5-4-309
description: >
    Object.create - [[Configurable]] is set as false if it is absent
    in data descriptor of one property in 'Properties' (8.12.9 step
    4.a.i)
includes: [propertyHelper.js]
---*/

var newObj = Object.create({}, {
  prop: {
    value: 1001,
    writable: true,
    enumerable: true
  }
});

verifyProperty(newObj, "prop", {
  configurable: false,
});

reportCompare(0, 0);
