// |reftest| shell-option(--enable-iterator-chunking) skip-if(!Iterator.prototype.chunks||!xulRuntime.shell) -- iterator-chunking is not enabled unconditionally, requires shell-options
// Copyright (C) 2026 Michael Ficarra. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-iterator.prototype.windows
description: >
  Iterator.prototype.windows is callable
features: [iterator-chunking, generators]
---*/
function* g() {}
Iterator.prototype.windows.call(g(), 1);

let iter = g();
iter.windows(1);

reportCompare(0, 0);
