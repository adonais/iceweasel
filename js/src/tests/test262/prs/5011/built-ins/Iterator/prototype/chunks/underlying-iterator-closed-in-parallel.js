// |reftest| shell-option(--enable-iterator-chunking) skip-if(!Iterator.prototype.chunks||!xulRuntime.shell) -- iterator-chunking is not enabled unconditionally, requires shell-options
// Copyright (C) 2026 Michael Ficarra. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-iterator.prototype.chunks
description: >
  Underlying iterator is closed after calling chunks
info: |
  Iterator.prototype.chunks ( chunkSize )

features: [iterator-chunking, generators]
---*/
let iterator = (function* () {
  for (let i = 0; i < 5; ++i) {
    yield i;
  }
})();

let chunked = iterator.chunks(2);

iterator.return();

let { value, done } = chunked.next();

assert.sameValue(value, undefined);
assert.sameValue(done, true);

reportCompare(0, 0);
