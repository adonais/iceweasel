// Copyright (c) 2012 Ecma International.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
es5id: 15.2.3.7-5-a-13
description: >
    Object.defineProperties - 'Properties' is a Date object which
    implements its own [[Get]] method to get enumerable own property
---*/

var obj = {};
var props = new Date(0);

Object.defineProperty(props, "prop", {
  value: {
    value: 13
  },
  enumerable: true
});
Object.defineProperties(obj, props);

assert(obj.hasOwnProperty("prop"), 'obj.hasOwnProperty("prop") !== true');
assert.sameValue(obj.prop, 13, 'obj.prop');

reportCompare(0, 0);
