// |reftest| shell-option(--enable-iterator-chunking) skip-if(!Iterator.prototype.chunks||!xulRuntime.shell) -- iterator-chunking is not enabled unconditionally, requires shell-options
// Copyright (C) 2026 Michael Ficarra. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-iterator.prototype.chunks
description: >
  Throws a TypeError when the closure generator is already running.
info: |
  %IteratorHelperPrototype%.next ( )
    1. Return ? GeneratorResume(this value, undefined, "Iterator Helper").

  27.5.3.3 GeneratorResume ( generator, value, generatorBrand )
    1. Let state be ? GeneratorValidate(generator, generatorBrand).
    ...

  27.5.3.2 GeneratorValidate ( generator, generatorBrand )
    ...
    6. If state is executing, throw a TypeError exception.
    ...

features: [iterator-chunking]
---*/

var loopCount = 0;

var iter;
var iterator = {
  get next() {
    return function () {
      loopCount++;
      iter.next();
      return { done: false, value: 0 };
    };
  }
};

iter = Iterator.prototype.chunks.call(iterator, 1);

assert.throws(TypeError, function () {
  iter.next();
});

assert.sameValue(loopCount, 1);

reportCompare(0, 0);
