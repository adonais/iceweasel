// |reftest| shell-option(--enable-iterator-chunking) skip-if(!Iterator.prototype.chunks||!xulRuntime.shell) -- iterator-chunking is not enabled unconditionally, requires shell-options
// Copyright (C) 2026 Michael Ficarra. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-iterator.prototype.windows
description: >
  Property descriptor of Iterator.prototype.windows
info: |
  Iterator.prototype.windows

  17 ECMAScript Standard Built-in Objects

  Every other data property described in clauses 18 through 26 and in Annex B.2
  has the attributes { [[Writable]]: true, [[Enumerable]]: false,
  [[Configurable]]: true } unless otherwise specified.
features: [iterator-chunking]
includes: [propertyHelper.js]
---*/

verifyProperty(Iterator.prototype, 'windows', {
  writable: true,
  enumerable: false,
  configurable: true,
});

reportCompare(0, 0);
