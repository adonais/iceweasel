// |reftest| shell-option(--enable-iterator-chunking) skip-if(!Iterator.prototype.chunks||!xulRuntime.shell) -- iterator-chunking is not enabled unconditionally, requires shell-options
// Copyright (C) 2026 Michael Ficarra. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-iterator.prototype.chunks
description: >
  Iterator.prototype.chunks has a "length" property whose value is 1.
info: |
  ECMAScript Standard Built-in Objects

  Unless otherwise specified, the length property of a built-in
  Function object has the attributes { [[Writable]]: false, [[Enumerable]]:
  false, [[Configurable]]: true }.
features: [iterator-chunking]
includes: [propertyHelper.js]
---*/

verifyProperty(Iterator.prototype.chunks, 'length', {
  value: 1,
  writable: false,
  enumerable: false,
  configurable: true,
});

reportCompare(0, 0);
