// |reftest| shell-option(--enable-iterator-includes) skip-if(!Iterator.prototype.includes||!xulRuntime.shell) -- iterator-includes is not enabled unconditionally, requires shell-options
// Copyright (C) 2026 Michael Ficarra. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-iterator.prototype.includes
description: >
  Underlying iterator next returns object with throwing done getter
features: [iterator-includes]
---*/

let iterator = {
  __proto__: Iterator.prototype,
  next() {
    return {
      get done() {
        throw new Test262Error();
      },
      value: 1,
    };
  },
  get return() {
    throw new TypeError();
  }
};

assert.throws(Test262Error, function() {
  iterator.includes(0);
});

reportCompare(0, 0);
